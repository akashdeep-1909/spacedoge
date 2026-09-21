import { randomBytes, createHash } from "node:crypto";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { BalanceType, GameMode } from "@/generated/prisma/enums";
import { GAME_MODE_CONFIG, botScore, RENTAL_BOT_MIN_HUMANS, LOBBY_MIN_HUMANS_TO_START } from "@/lib/game-config";
import { getGameModeConfigs, getGameModeConfig, computeRoomEconomicsFromConfig } from "@/lib/gameModes";
import { distributeEntryFeeToTreasuryAndReferrals } from "@/lib/referrals";
import { getWalletBalances, lockWalletForBalanceChange, getLedgerBalance } from "@/lib/balances";
import { sendPushToWallet } from "@/lib/push";
import { consumeLoadoutSelections } from "@/lib/shop";
import { ShopItemCategory } from "@/generated/prisma/enums";
import { SOLO_LOADOUT_CATEGORIES } from "@/lib/shop-shared";
import type { GameLobby, LobbyParticipant } from "@/generated/prisma/client";

// v3 multiplayer — "Play with Friends". A GameLobby holds 1-4 real
// humans (remaining seats auto-filled by deterministic bots) before a
// single Match is created. See finalizeLobby() below for the one place
// the room economy (prize pool / platform fee / referral split /
// treasury credit) is computed and credited — exactly once per room,
// never once per invited human.
// 5 minutes, not 60s — the join window has to survive a real invite
// round-trip (copy the link, switch to WhatsApp/Telegram, send it,
// friend opens it), not just an in-app click. The invite LINK's own
// validity is tied to this same window (INVITATION_TTL_SECONDS below),
// so a too-short value here made shared links expire before anyone
// realistically had a chance to click them — that was the actual bug
// behind "the link was already expired." A host who doesn't want to
// wait can already just click "Start with Random Players" any time.
export const LOBBY_WAIT_SECONDS = 300;
export const LOBBY_MAX_PLAYERS = 4;
export const RESULTS_GRACE_PERIOD_SECONDS = 90;
export const INVITATION_TTL_SECONDS = LOBBY_WAIT_SECONDS;

// Only these five modes are ever selectable for a friends lobby. The
// server never trusts a mode, fee, or duration sent by the client for
// lobby creation — only a package amount, resolved here against each
// mode's CURRENT admin-configured entry fee (src/lib/gameModes.ts),
// never a hardcoded amount-to-mode map. An admin changing a fee takes
// effect on the very next lobby created, with no separate map to keep
// in sync.
const STAKES_MODES: GameMode[] = [
  GameMode.QUICK_RUSH,
  GameMode.EXPLORER_RUSH,
  GameMode.PRO_RUSH,
  GameMode.ELITE_RUSH,
  GameMode.CHAMPION_RUSH,
];

export async function getStakesModeConfigs() {
  const enabled = await getGameModeConfigs({ enabledOnly: true });
  return enabled.filter((c) => STAKES_MODES.includes(c.mode));
}

export async function resolveStakesModeByPackageAmount(amount: number) {
  const configs = await getStakesModeConfigs();
  return configs.find((c) => Number(c.entryFeeUsdt) === amount) ?? null;
}

function round8(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

const ROOM_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I — avoids visual ambiguity when shared
export function generateRoomCode(): string {
  const bytes = randomBytes(6);
  let code = "";
  for (const b of bytes) code += ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length];
  return code;
}

export function generateInviteToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Debits PLAY_USDT immediately when a seat is reserved (host creating a
// lobby, or an invitee accepting) — the "hold." Because
// getWalletBalances() is a pure ledger-sum reconstruction (no stored
// balance columns anywhere in this schema), a hold IS a real debit;
// there's no separate reserved-balance mechanism to build. Returns the
// created LedgerEntry's id so the caller can store it on
// LobbyParticipant.entryHoldLedgerId for traceability.
export async function holdEntryFee(
  tx: Prisma.TransactionClient,
  params: { walletProfileId: string; entryFeeUsdt: number; lobbyId: string }
): Promise<string> {
  const { walletProfileId, entryFeeUsdt, lobbyId } = params;
  const entry = await tx.ledgerEntry.create({
    data: {
      walletProfileId,
      balanceType: BalanceType.PLAY_USDT,
      amount: -entryFeeUsdt,
      reason: "match_entry_hold",
      refType: "GameLobby",
      refId: lobbyId,
    },
  });
  return entry.id;
}

// Reverses a hold — cancel, expire-without-progressing, or leave
// before start. Never called after finalize: a consumed hold simply
// never gets released (see LobbyParticipant.entryHoldLedgerId doc
// comment in schema.prisma).
export async function releaseEntryHold(
  tx: Prisma.TransactionClient,
  params: { walletProfileId: string; entryFeeUsdt: number; lobbyId: string }
): Promise<void> {
  const { walletProfileId, entryFeeUsdt, lobbyId } = params;
  await tx.ledgerEntry.create({
    data: {
      walletProfileId,
      balanceType: BalanceType.PLAY_USDT,
      amount: entryFeeUsdt,
      reason: "match_entry_hold_release",
      refType: "GameLobby",
      refId: lobbyId,
    },
  });
}

// Cancels a WAITING/FULL lobby: releases every joined human's hold,
// marks the lobby CANCELLED. No-ops (returns false) if another request
// already claimed the lobby for finalize/cancel — same optimistic
// version guard finalizeLobby() uses, so a cancel racing a finalize
// can never both "succeed." `reason` is null for an ordinary host-
// initiated cancel (POST /api/lobbies/[id]/cancel never passes one);
// finalizeIfExpired below passes "RENTAL_BOT_NOT_ENOUGH_FRIENDS" for
// the one system-initiated case, so the UI can explain why.
export async function cancelLobby(lobbyId: string, reason: string | null = null): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const lobby = await tx.gameLobby.findUnique({ where: { id: lobbyId }, include: { participants: true } });
    if (!lobby || (lobby.status !== "WAITING" && lobby.status !== "FULL")) return false;

    const claimed = await tx.gameLobby.updateMany({
      where: { id: lobbyId, version: lobby.version, status: { in: ["WAITING", "FULL"] } },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason, version: { increment: 1 } },
    });
    if (claimed.count === 0) return false;

    for (const p of lobby.participants) {
      if (p.status !== "JOINED") continue;
      await releaseEntryHold(tx, {
        walletProfileId: p.walletProfileId,
        entryFeeUsdt: Number(lobby.entryFeeUsdt),
        lobbyId,
      });
      await tx.lobbyParticipant.update({ where: { id: p.id }, data: { status: "LEFT", leftAt: new Date() } });
    }
    await tx.lobbyInvitation.updateMany({
      where: { lobbyId, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    return true;
  });
}

// A single non-host JOINED participant backing out before the match
// starts — confirmed live as a real gap: only the host had any way out
// of the pre-start loadout screen (via cancelLobby above, which ends
// the whole room for everyone); a friend who accepted an invite by
// mistake, or just changed their mind, had no way back except leaving
// the tab open on a screen they didn't want to be on. Unlike
// cancelLobby, this only ever touches the caller's own seat: their own
// entry-fee hold is released, everyone else's stays untouched. A FULL
// room drops back to WAITING the instant a seat opens up so someone
// else can join it.
//
// Deletes the participant row outright rather than soft-flipping it to
// LEFT (which is what cancelLobby above still does): slotNumber is
// permanently unique per lobby (@@unique([lobbyId, slotNumber])), so a
// LEFT-but-still-present row keeps its slot forever reserved even
// though the lobby's own UI already shows that seat as empty — the
// NEXT joiner would land on a slot past LOBBY_MAX_PLAYERS instead of
// reusing it, and serializeLobby's `slots` array (always exactly 1..
// LOBBY_MAX_PLAYERS) would then silently never show that joiner at
// all, despite them genuinely holding a seat and an entry-fee hold.
// cancelLobby doesn't need this: it only ever runs on a lobby that's
// about to become CANCELLED, which joinLobbySeat already refuses to
// touch again regardless of what slotNumbers its LEFT rows hold.
// Nothing else in the app reads LobbyParticipant.status === "LEFT" as
// a history/audit signal, so deleting here loses nothing.
export async function leaveLobbySeat(lobbyId: string, walletProfileId: string): Promise<{ ok: boolean; error?: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const lobby = await db.gameLobby.findUnique({ where: { id: lobbyId }, include: { participants: true } });
    if (!lobby) return { ok: false, error: "Lobby not found" };
    if (lobby.status !== "WAITING" && lobby.status !== "FULL") {
      return { ok: false, error: "This lobby has already started or ended" };
    }
    // The host has no equivalent here on purpose — removing them would
    // leave the room without one; cancelLobby is their own way out.
    if (lobby.hostWalletProfileId === walletProfileId) {
      return { ok: false, error: "The host can't leave — cancel the lobby instead" };
    }
    const participant = lobby.participants.find((p) => p.walletProfileId === walletProfileId && p.status === "JOINED");
    if (!participant) return { ok: false, error: "You're not in this lobby" };

    const claimResult = await db.$transaction(async (tx) => {
      const claim = await tx.gameLobby.updateMany({
        where: { id: lobbyId, version: lobby.version, status: lobby.status },
        data: { version: { increment: 1 } },
      });
      if (claim.count === 0) return { kind: "lost_race" as const };

      await releaseEntryHold(tx, {
        walletProfileId,
        entryFeeUsdt: Number(lobby.entryFeeUsdt),
        lobbyId,
      });
      await tx.lobbyParticipantSelection.deleteMany({ where: { lobbyParticipantId: participant.id } });
      await tx.lobbyParticipant.delete({ where: { id: participant.id } });
      if (lobby.status === "FULL") {
        await tx.gameLobby.update({ where: { id: lobbyId }, data: { status: "WAITING" } });
      }
      return { kind: "left" as const };
    });

    if (claimResult.kind === "lost_race") continue; // retry against fresh state
    return { ok: true };
  }
  return { ok: false, error: "Could not leave, please try again." };
}

type LobbyWithParticipants = GameLobby & { participants: LobbyParticipant[] };

// The single place a Match is ever created from a lobby. Concurrency-
// safe via an optimistic version guard (spec section 10/15/16): only
// the request whose updateMany actually matches a row moves on to
// build the match — every other simultaneous caller (host clicking
// Start while the 4th player's accept lands, or the expiry sweep
// racing a live poller) gets a no-op back.
export async function finalizeLobby(lobbyId: string): Promise<{ matchId: string } | null> {
  return db.$transaction(async (tx) => {
    const lobby = (await tx.gameLobby.findUnique({
      where: { id: lobbyId },
      include: { participants: true },
    })) as LobbyWithParticipants | null;
    if (!lobby) return null;
    if (lobby.status === "STARTED") return lobby.finalMatchId ? { matchId: lobby.finalMatchId } : null;
    if (lobby.status !== "WAITING" && lobby.status !== "FULL" && lobby.status !== "FILLING_AI") return null;

    const claimed = await tx.gameLobby.updateMany({
      where: { id: lobbyId, version: lobby.version, status: lobby.status },
      data: { status: "STARTING", version: { increment: 1 } },
    });
    if (claimed.count === 0) return null; // someone else already claimed this finalize

    const humanParticipants = lobby.participants.filter((p) => p.status === "JOINED");
    const mode = lobby.mode;
    // The lobby's OWN stored entryFeeUsdt/durationSec (snapshotted at
    // creation time, same GameLobby columns holdEntryFee already keys
    // off) is what's used here — not a fresh admin-config lookup that
    // could've changed while this lobby was still waiting for players.
    const econ = computeRoomEconomicsFromConfig({
      entryFeeUsdt: Number(lobby.entryFeeUsdt),
      durationSec: lobby.durationSec,
      prefundedPoolUsdt: null, // friends lobbies are always a paid stakes tier, never a prefunded promo mode
    });

    const match = await tx.match.create({
      data: {
        mode,
        entryFeeUsdt: econ.entryFeeUsdt,
        prizePoolUsdt: econ.prizePoolUsdt,
        platformFeeUsdt: econ.platformFeeUsdt,
        miningReserveUsdt: econ.miningReserveUsdt,
        referralReserveUsdt: econ.referralReserveUsdt,
        status: "IN_MATCH",
        mapSeed: lobby.mapSeed,
        startedAt: new Date(),
        durationSec: lobby.durationSec,
        resultsDeadlineAt: new Date(Date.now() + (lobby.durationSec + RESULTS_GRACE_PERIOD_SECONDS) * 1000),
      },
    });

    // Below RENTAL_BOT_MIN_HUMANS real humans, a Rental Bot selection is
    // never actually consumed. In practice every caller of
    // finalizeLobby already keeps this from ever being reached under-
    // crewed — POST /api/lobbies/[id]/start hard-blocks the manual
    // action, finalizeIfExpired cancels rather than finalizing an
    // under-crewed expired lobby, and the all-4-humans-joined auto-
    // start (joinLobbySeat below) is never under-crewed by definition
    // — but this stays as a last-resort backstop for any future caller
    // that forgets the rule, rather than trusting every call site to
    // get it right. Silently skipped, not an error — same graceful
    // degradation an expired/exhausted selection already gets from
    // consumeLoadoutSelections itself.
    const enoughHumansForRentalBot = humanParticipants.length >= RENTAL_BOT_MIN_HUMANS;

    let slot = 1;
    for (const p of humanParticipants) {
      await tx.matchParticipant.create({
        data: {
          matchId: match.id,
          walletProfileId: p.walletProfileId,
          isBot: false,
          slotNumber: slot,
          joinSource: p.joinSource,
        },
      });
      // Actually consumes this participant's own loadout — the Rental
      // Bot selection (set any time before start via
      // setLobbyRentalBot()) PLUS every other category's own selection
      // (setLobbyLoadoutSelection(), LobbyParticipantSelection rows),
      // combined into one call so this participant gets exactly one
      // MatchLoadout row with every equipped category on it, same
      // shape a solo match's own loadout produces. Writes the real
      // MatchLoadout/MatchLoadoutSelection audit row and decrements
      // usesRemaining exactly like solo already does —
      // allowRentalBot: enoughHumansForRentalBot is what makes this
      // the ONE place a RENTAL_BOT selection is ever actually resolved
      // (see consumeLoadoutSelections' own doc-comment); every other
      // category has no such gate. A since-expired/exhausted selection
      // (of either kind) is silently dropped by that function's own
      // existing logic — this participant just plays without it
      // instead, same graceful degradation solo already relies on for
      // a stale client snapshot.
      const otherSelections = await tx.lobbyParticipantSelection.findMany({ where: { lobbyParticipantId: p.id } });
      const selections: Partial<Record<ShopItemCategory, string>> = {};
      for (const s of otherSelections) selections[s.category] = s.walletShopItemId;
      if (p.walletShopItemId) selections[ShopItemCategory.RENTAL_BOT] = p.walletShopItemId;
      if (Object.keys(selections).length > 0) {
        await consumeLoadoutSelections(tx, p.walletProfileId, match.id, selections, { allowRentalBot: enoughHumansForRentalBot });
      }
      slot++;
    }
    // Disclosed bots fill whatever seats real humans didn't — same
    // deterministic bot:<mapSeed>:<slot> convention instant play uses,
    // just keyed off the lobby's own stored seed instead of a fresh one.
    for (; slot <= LOBBY_MAX_PLAYERS; slot++) {
      const botProfile = await tx.walletProfile.upsert({
        where: { address: `bot:${lobby.mapSeed}:${slot}` },
        update: {},
        create: { address: `bot:${lobby.mapSeed}:${slot}`, chainId: 0, ageConfirmed: true },
      });
      await tx.matchParticipant.create({
        data: {
          matchId: match.id,
          walletProfileId: botProfile.id,
          isBot: true,
          slotNumber: slot,
          joinSource: "AI_FILL",
        },
      });
    }

    // Room economy computed and credited exactly once here, regardless
    // of humanCount — see src/lib/referrals.ts for the equal-share
    // multi-human split.
    if (econ.entryFeeUsdt > 0) {
      await distributeEntryFeeToTreasuryAndReferrals(tx, {
        humans: humanParticipants.map((p) => ({ referredWalletProfileId: p.walletProfileId })),
        platformFeeUsdt: econ.platformFeeUsdt,
        matchId: match.id,
      });
    }

    await tx.lobbyInvitation.updateMany({
      where: { lobbyId, status: "PENDING" },
      data: { status: "MATCH_STARTED" },
    });

    await tx.gameLobby.update({
      where: { id: lobbyId },
      data: { status: "STARTED", startedAt: new Date(), finalMatchId: match.id },
    });

    return { matchId: match.id };
  });
}

// Used by POST /api/lobbies/[id]/start to hard-block the host's
// deliberate "Start with Random Players" click, AND by
// finalizeIfExpired below to cancel (rather than auto-finalize with AI
// fill) a lobby whose own wait window ran out while still under-
// crewed — the two ways a Rental-Bot-equipped room could otherwise end
// up finalizing with AI filling the gap, one deliberate and one
// passive, both now closed the same way. See RENTAL_BOT_MIN_HUMANS's
// own doc-comment for the underlying rule.
export async function lobbyNeedsMoreHumansForRentalBot(lobbyId: string): Promise<boolean> {
  const lobby = await db.gameLobby.findUnique({
    where: { id: lobbyId },
    include: { participants: { where: { status: "JOINED" } } },
  });
  if (!lobby) return false;
  if (lobby.participants.length >= RENTAL_BOT_MIN_HUMANS) return false;
  return lobby.participants.some((p) => !!p.walletShopItemId);
}

// Generalizes the Rental-Bot-specific rule above to every lobby — see
// LOBBY_MIN_HUMANS_TO_START's own doc-comment. Used the exact same way:
// POST /api/lobbies/[id]/start hard-blocks the host's deliberate "Start
// with Random Players" click, and finalizeIfExpired below cancels
// (rather than auto-finalizing with AI fill) a lobby whose wait window
// ran out with only the host ever present. Checked independently of,
// and before, lobbyNeedsMoreHumansForRentalBot above — a room with a
// Rental Bot equipped still needs that stricter 3-human bar even once
// this 2-human floor is cleared.
export async function lobbyNeedsMoreHumansToStart(lobbyId: string): Promise<boolean> {
  const lobby = await db.gameLobby.findUnique({
    where: { id: lobbyId },
    include: { participants: { where: { status: "JOINED" } } },
  });
  if (!lobby) return false;
  return lobby.participants.length < LOBBY_MIN_HUMANS_TO_START;
}

// Lazy expiry — no cron/queue infra exists in this stack (confirmed).
// Called from GET /api/lobbies/[id] (so any active poller self-heals
// the lobby) and from POST /api/lobbies/sweep-expired (a cron-style
// endpoint to wire to a platform scheduler in production, for the case
// where literally no browser is left polling). Returns true if this
// call finalized the lobby.
export async function finalizeIfExpired(lobbyId: string): Promise<boolean> {
  const lobby = await db.gameLobby.findUnique({ where: { id: lobbyId } });
  if (!lobby) return false;

  if (lobby.status === "WAITING") {
    if (Date.now() < lobby.expiresAt.getTime()) return false;

    // Nobody ever actually joined the host — same rule
    // POST /api/lobbies/[id]/start already hard-blocks on the deliberate
    // "Start with Random Players" click (see lobbyNeedsMoreHumansToStart's
    // own doc-comment); letting the clock quietly auto-start with AI
    // filling every seat instead was the same "With Friends, no friends"
    // loophole with extra steps. Cancel the room instead (releases the
    // host's entry-fee hold) so they actually have to invite someone —
    // or just use the plain solo "Play" button, which was never subject
    // to this rule at all.
    if (await lobbyNeedsMoreHumansToStart(lobbyId)) {
      await cancelLobby(lobbyId, "NOT_ENOUGH_FRIENDS");
      return false;
    }

    // A Rental Bot equipped but the room never reached
    // RENTAL_BOT_MIN_HUMANS real friends by the time the wait window
    // ran out — POST /api/lobbies/[id]/start already hard-blocks the
    // host from deliberately forcing this with "Start with Random
    // Players" (see lobbyNeedsMoreHumansForRentalBot's own doc-
    // comment); letting the clock quietly do the exact same thing —
    // auto-starting with AI filling every empty seat — was the same
    // loophole with extra steps. Cancel the room instead (releases
    // every joined human's entry-fee hold) so the host actually has to
    // get their friends in, never just wait the timer out. A lobby with
    // no Rental Bot equipped (and already past the general 2-human floor
    // just above) keeps behaving exactly as before, auto-starting with
    // AI fill on expiry.
    if (await lobbyNeedsMoreHumansForRentalBot(lobbyId)) {
      await cancelLobby(lobbyId, "RENTAL_BOT_NOT_ENOUGH_FRIENDS");
      return false;
    }

    // Mark the transitional state before finalize so a poller lands on
    // a meaningful status even if it reads between these two calls.
    await db.gameLobby.updateMany({
      where: { id: lobbyId, status: "WAITING", version: lobby.version },
      data: { status: "FILLING_AI", version: { increment: 1 } },
    });
  } else if (lobby.status !== "FILLING_AI") {
    return false;
  }
  // A lobby already sitting in FILLING_AI got there because something
  // (the host's "Start with AI" click, or this same expiry path a
  // previous poll took) already decided to finalize it — but the
  // finalizeLobby() call that should have followed never completed
  // (request crashed/timed out mid-flight, etc.), leaving it stuck
  // with no other retry path: POST .../start requires WAITING/FULL, so
  // it 409s on FILLING_AI, and this function used to only fire for
  // WAITING. Retrying here — on every poll, not just the first —
  // means an active waiting-room screen self-heals within a few
  // seconds instead of showing "Starting match…" forever. Safe to
  // retry freely: finalizeLobby() version-checks its own claim and
  // no-ops once the lobby actually reaches STARTED.
  const result = await finalizeLobby(lobbyId);
  return result !== null;
}

// Deterministic bot scoring, generalized from src/lib/game-config.ts's
// botScore() to key off the participant's own stable slotNumber
// (always populated for lobby-originated matches) instead of an array
// index that depends on unordered query results.
export function botScoreForSlot(mapSeed: string, slotNumber: number, durationSec: number): number {
  return botScore(mapSeed, slotNumber, durationSec);
}

// Spec section 6/13: a wallet can't create/join a second lobby or
// match while already busy in one. Checks both an active lobby seat
// and an in-progress match participation (instant play or a lobby
// match already finalized but not yet settled).
// Instant play (POST /api/matches directly, no lobby) has never had any
// abandonment handling — if a player closes the tab mid-round, their
// Match row just sits at IN_MATCH forever, since nothing ever calls
// /settle for them. That pre-existing gap was invisible until this
// busy-check started existing: without a staleness cutoff, a match
// abandoned days ago would permanently block that wallet from ever
// creating or joining a lobby again. A match still IN_MATCH well past
// when it should have ended is stale, not active.
const STALE_MATCH_GRACE_SECONDS = 120;

// The thing actually blocking checkPaidEligibility's busy-check, surfaced
// with enough detail for the client to offer a real way back in — see
// GET /api/matches/active — instead of a dead-end "already busy" error
// with no path forward.
export type ActiveBusyState =
  | { type: "lobby"; lobbyId: string }
  | {
      type: "match";
      matchId: string;
      mapSeed: string;
      mode: GameMode;
      durationSec: number;
      prizePoolUsdt: number;
      startedAt: string;
    }
  | null;

export async function getActiveBusyState(walletProfileId: string): Promise<ActiveBusyState> {
  const activeLobbySeat = await db.lobbyParticipant.findFirst({
    where: {
      walletProfileId,
      status: "JOINED",
      lobby: { status: { in: ["WAITING", "FULL", "FILLING_AI", "STARTING"] } },
    },
    select: { lobbyId: true },
  });
  if (activeLobbySeat) return { type: "lobby", lobbyId: activeLobbySeat.lobbyId };

  const inMatchParticipations = await db.matchParticipant.findMany({
    where: { walletProfileId, isBot: false, match: { status: "IN_MATCH" } },
    include: { match: true },
  });

  const now = Date.now();
  for (const { match } of inMatchParticipations) {
    const durationSec = match.durationSec ?? GAME_MODE_CONFIG[match.mode].durationSec;
    const startedAt = match.startedAt ?? match.createdAt;
    const deadline = match.resultsDeadlineAt
      ? match.resultsDeadlineAt.getTime()
      : startedAt.getTime() + (durationSec + STALE_MATCH_GRACE_SECONDS) * 1000;
    if (now < deadline) {
      return {
        type: "match",
        matchId: match.id,
        mapSeed: match.mapSeed,
        mode: match.mode,
        durationSec,
        prizePoolUsdt: Number(match.prizePoolUsdt),
        startedAt: startedAt.toISOString(),
      };
    }
  }
  return null;
}

export async function isWalletBusy(walletProfileId: string): Promise<boolean> {
  return (await getActiveBusyState(walletProfileId)) !== null;
}

// Shared eligibility gate for create-lobby / accept-invite / join-link
// — spec sections 6 and 13's numbered pre-checks, minus the
// lobby-specific ones (status/capacity/package match) each caller
// checks itself. Returns null when eligible, or an
// { status, error } pair ready to hand straight to NextResponse.json.
export async function checkPaidEligibility(
  walletProfile: { ageConfirmed: boolean; countryCode: string | null; riskFlag: string | null },
  walletProfileId: string,
  entryFeeUsdt: number
): Promise<{ status: number; error: string } | null> {
  if (!walletProfile.ageConfirmed || !walletProfile.countryCode) {
    return { status: 403, error: "Complete onboarding before paid play." };
  }
  if (walletProfile.riskFlag === "blocked") {
    return { status: 403, error: "This wallet is restricted from paid play." };
  }
  if (await isWalletBusy(walletProfileId)) {
    return { status: 409, error: "You're already in another active lobby or match." };
  }
  if (entryFeeUsdt > 0) {
    const balances = await getWalletBalances(walletProfileId);
    if (balances.playUsdt < entryFeeUsdt) {
      return {
        status: 402,
        error: `You need at least ${entryFeeUsdt} USDT in your Deposit USDT to join this match.`,
      };
    }
  }
  return null;
}

// Shared response shape for GET /api/lobbies/[id] and every mutating
// lobby endpoint that returns the lobby afterward — one source of
// truth for what the polling UI reads.
export async function serializeLobby(lobbyId: string, viewerWalletProfileId: string | null) {
  const lobby = await db.gameLobby.findUnique({
    where: { id: lobbyId },
    include: {
      host: { select: { address: true } },
      participants: {
        where: { status: "JOINED" },
        include: {
          walletProfile: { select: { address: true, nickname: true } },
          walletShopItem: { include: { shopItemConfig: { select: { label: true } } } },
          selections: { include: { walletShopItem: { include: { shopItemConfig: { select: { label: true } } } } } },
        },
        orderBy: { slotNumber: "asc" },
      },
      invitations: {
        where: { status: "PENDING" },
        include: { recipient: { select: { address: true, nickname: true } } },
      },
    },
  });
  if (!lobby) return null;

  // Display label is looked up fresh (an admin rename should show up
  // immediately); the pool math uses the LOBBY's own stored
  // entryFeeUsdt, snapshotted at creation — never a live re-fetch that
  // could drift from what this specific room actually charged.
  const cfg = await getGameModeConfig(lobby.mode);
  const nominalRoomPoolUsdt = Number(lobby.entryFeeUsdt) * LOBBY_MAX_PLAYERS;
  // The REAL reward pool (70% of the full room — see
  // computeRoomEconomicsFromConfig's own doc-comment, same formula
  // finalizeLobby uses to actually stamp Match.prizePoolUsdt) — never
  // the un-reduced nominalRoomPoolUsdt above. Confirmed live as a real
  // bug: the lobby page was passing nominalRoomPoolUsdt (the full,
  // 100% headline number, e.g. $4.00) as CoinRushArena's own
  // prizePoolUsdt prop, so a "With Friends" match's live HUD showed a
  // different PRIZE POOL figure than the identical solo mode ($4.00 vs
  // solo's correct $2.80) — and, more seriously, fed the wrong pool
  // into the client's own computeRankTierTargetsPts (CoinRushArena's
  // bumpedGuaranteedTargets, used to pace a guaranteed bot's live PTS
  // toward its real reward-tier target), so a lobby match's live-paced
  // bot totals were computed against a target ~43% too high, converging
  // to a number settlement (which correctly uses Match.prizePoolUsdt)
  // would never actually pay.
  const rewardPoolUsdt = computeRoomEconomicsFromConfig({
    entryFeeUsdt: Number(lobby.entryFeeUsdt),
    durationSec: lobby.durationSec,
    prefundedPoolUsdt: null,
  }).prizePoolUsdt;
  // The VIEWER's own current Rental Bot selection for this lobby (set/
  // cleared any time before start via setLobbyRentalBot) — null if
  // they haven't equipped one, or if viewerWalletProfileId isn't even
  // a participant here. Not consumed yet at this point (see
  // finalizeLobby's own consumeLoadoutSelections call for that) —
  // just what they've currently got selected, for the lobby
  // waiting-room UI to reflect back.
  const viewerParticipant = lobby.participants.find((p) => p.walletProfileId === viewerWalletProfileId);
  const myRentalBot =
    viewerParticipant?.walletShopItemId && viewerParticipant.walletShopItem
      ? { walletShopItemId: viewerParticipant.walletShopItemId, label: viewerParticipant.walletShopItem.shopItemConfig.label }
      : null;
  // Same idea as myRentalBot above, generalized to every OTHER
  // sellable category (a purchased rocket skin/Speed/Health/Magnet/
  // Fire/Shield upgrade) — set/cleared any time before start via
  // setLobbyLoadoutSelection, not yet consumed at this point (see
  // finalizeLobby's own consumeLoadoutSelections call for that).
  const myLoadout: Partial<Record<string, { walletShopItemId: string; label: string }>> = {};
  for (const s of viewerParticipant?.selections ?? []) {
    myLoadout[s.category] = { walletShopItemId: s.walletShopItemId, label: s.walletShopItem.shopItemConfig.label };
  }
  const slots = Array.from({ length: LOBBY_MAX_PLAYERS }, (_, i) => i + 1).map((slotNumber) => {
    const occupant = lobby.participants.find((p) => p.slotNumber === slotNumber);
    if (!occupant) return { slotNumber, state: "EMPTY" as const };
    return {
      slotNumber,
      state: "HUMAN" as const,
      address: occupant.walletProfile.address,
      nickname: occupant.walletProfile.nickname,
      isHost: occupant.walletProfileId === lobby.hostWalletProfileId,
      joinSource: occupant.joinSource,
    };
  });

  return {
    id: lobby.id,
    roomCode: lobby.roomCode,
    status: lobby.status,
    mode: lobby.mode,
    modeLabel: cfg.label,
    entryFeeUsdt: Number(lobby.entryFeeUsdt),
    durationSec: lobby.durationSec,
    nominalRoomPoolUsdt,
    rewardPoolUsdt,
    host: { address: lobby.host.address },
    isHost: viewerWalletProfileId === lobby.hostWalletProfileId,
    // Session-based (the same viewerParticipant lookup myRentalBot/
    // myLoadout already use), not derived from the client's own wagmi
    // address — confirmed live as a real bug in the lobby page's
    // pre-join gate (see its own amIJoined doc-comment): wagmi's
    // useAccount().address can legitimately lag or be briefly
    // unavailable right after a fresh SIWE session even with a real
    // wallet connected, and comparing against it meant the gate could
    // never reliably confirm "yes, I actually just joined" — this is
    // the ground truth instead.
    amIJoined: !!viewerParticipant,
    myRentalBot,
    myLoadout,
    slots,
    humanCount: lobby.participants.length,
    maxPlayers: LOBBY_MAX_PLAYERS,
    hasInviteLink: lobby.inviteTokenHash !== null,
    pendingInvitations: lobby.invitations.map((inv) => ({
      id: inv.id,
      recipientAddress: inv.recipient.address,
      recipientNickname: inv.recipient.nickname,
      expiresAt: inv.expiresAt,
    })),
    expiresAt: lobby.expiresAt,
    startedAt: lobby.startedAt,
    finalMatchId: lobby.finalMatchId,
    cancelReason: lobby.cancelReason,
    serverTime: new Date(),
  };
}

// Sets or clears the CALLER's own Rental Bot selection for a lobby
// they're already sitting in (host or joiner, whichever of the 3 join
// paths got them there — this is the one shared surface every one of
// them lands on before the match starts, per the lobby waiting-room
// page). Only validates ownership/usability here — does NOT consume
// the item (no uses-decrement, no ledger, no audit row yet); real
// consumption happens exactly once, inside finalizeLobby(), via
// consumeLoadoutSelections. Callable any time before the lobby leaves
// WAITING/FULL (i.e. any time before STARTING/STARTED) — a player can
// change their mind, swap to a different owned Rental Bot, or clear it
// back to manual play, right up until the match actually begins.
export async function setLobbyRentalBot(
  lobbyId: string,
  walletProfileId: string,
  walletShopItemId: string | null
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const lobby = await db.gameLobby.findUnique({
    where: { id: lobbyId },
    include: { participants: { where: { walletProfileId, status: "JOINED" } } },
  });
  if (!lobby) return { ok: false, status: 404, error: "Lobby not found" };
  if (lobby.status !== "WAITING" && lobby.status !== "FULL") {
    return { ok: false, status: 409, error: "This lobby has already started — loadout can no longer be changed." };
  }
  const participant = lobby.participants[0];
  if (!participant) return { ok: false, status: 403, error: "You're not in this lobby" };

  if (walletShopItemId === null) {
    await db.lobbyParticipant.update({ where: { id: participant.id }, data: { walletShopItemId: null } });
    return { ok: true };
  }

  const item = await db.walletShopItem.findUnique({ where: { id: walletShopItemId } });
  const now = new Date();
  const isUsable =
    !!item &&
    item.walletProfileId === walletProfileId &&
    item.category === ShopItemCategory.RENTAL_BOT &&
    item.active &&
    (item.expiresAt === null || item.expiresAt > now) &&
    (item.usesRemaining === null || item.usesRemaining > 0);
  if (!isUsable) return { ok: false, status: 400, error: "That Space DOGE BOT isn't available to use." };

  await db.lobbyParticipant.update({ where: { id: participant.id }, data: { walletShopItemId } });
  return { ok: true };
}

// The general-purpose sibling of setLobbyRentalBot above, for every
// OTHER sellable category (ROCKET_SHAPE/STAT_SPEED/STAT_HEALTH/
// POWERUP_MAGNET/POWERUP_FIRE/POWERUP_SHIELD — never RENTAL_BOT, which
// stays on setLobbyRentalBot/walletShopItemId). Added because Play-
// with-Friends had never actually wired these categories in at all: a
// purchased rocket skin or Speed/Health/Magnet/Fire/Shield upgrade
// silently never applied in a lobby match — confirmed live as a real
// gap, since the ONLY category finalizeLobby ever consumed was Rental
// Bot. Same validate-now/consume-at-finalize split, same ownership/
// usability check, same WAITING/FULL-only window to change your mind.
export async function setLobbyLoadoutSelection(
  lobbyId: string,
  walletProfileId: string,
  category: (typeof SOLO_LOADOUT_CATEGORIES)[number],
  walletShopItemId: string | null
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const lobby = await db.gameLobby.findUnique({
    where: { id: lobbyId },
    include: { participants: { where: { walletProfileId, status: "JOINED" } } },
  });
  if (!lobby) return { ok: false, status: 404, error: "Lobby not found" };
  if (lobby.status !== "WAITING" && lobby.status !== "FULL") {
    return { ok: false, status: 409, error: "This lobby has already started — loadout can no longer be changed." };
  }
  const participant = lobby.participants[0];
  if (!participant) return { ok: false, status: 403, error: "You're not in this lobby" };

  if (walletShopItemId === null) {
    await db.lobbyParticipantSelection.deleteMany({ where: { lobbyParticipantId: participant.id, category } });
    return { ok: true };
  }

  const item = await db.walletShopItem.findUnique({ where: { id: walletShopItemId } });
  const now = new Date();
  const isUsable =
    !!item &&
    item.walletProfileId === walletProfileId &&
    item.category === category &&
    item.active &&
    (item.expiresAt === null || item.expiresAt > now) &&
    (item.usesRemaining === null || item.usesRemaining > 0);
  if (!isUsable) return { ok: false, status: 400, error: "That item isn't available to use." };

  await db.lobbyParticipantSelection.upsert({
    where: { lobbyParticipantId_category: { lobbyParticipantId: participant.id, category } },
    update: { walletShopItemId },
    create: { lobbyParticipantId: participant.id, category, walletShopItemId },
  });
  return { ok: true };
}

type JoinResult = { ok: true; lobbyId: string } | { ok: false; status: number; error: string };
type WalletProfileLike = {
  id: string;
  address: string;
  ageConfirmed: boolean;
  countryCode: string | null;
  riskFlag: string | null;
};

// Claims a seat in a WAITING/FULL lobby — shared by
// POST /api/lobbies/[id]/join, POST /api/invitations/[id]/accept, and
// POST /api/invite-links/[token]/join, so "two users claim the final
// seat simultaneously" (spec section 13) only needs to be handled
// correctly once. Uses the lobby's own `version` column as an
// optimistic-concurrency guard the same way finalizeLobby() does: the
// version-bump and the seat-insert happen in one transaction, so only
// one of two racing requests can ever win a given slot. The loser
// retries against fresh state (up to 3 attempts) rather than failing
// outright, since most "losses" just mean someone else took an
// earlier-numbered slot a moment sooner, not that the room is full.
export async function joinLobbySeat(
  lobbyId: string,
  walletProfile: WalletProfileLike,
  joinSource: "DIRECT_INVITE" | "INVITE_LINK"
): Promise<JoinResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const lobby = await db.gameLobby.findUnique({ where: { id: lobbyId }, include: { participants: true } });
    if (!lobby) return { ok: false, status: 404, error: "Lobby not found" };
    if (lobby.status !== "WAITING" && lobby.status !== "FULL") {
      return { ok: false, status: 409, error: "This lobby is no longer accepting players" };
    }
    if (lobby.participants.some((p) => p.walletProfileId === walletProfile.id && p.status === "JOINED")) {
      return { ok: false, status: 409, error: "You're already in this lobby" };
    }
    const joinedCount = lobby.participants.filter((p) => p.status === "JOINED").length;
    if (joinedCount >= LOBBY_MAX_PLAYERS) {
      return { ok: false, status: 409, error: "This match is already full." };
    }

    const eligibility = await checkPaidEligibility(walletProfile, walletProfile.id, Number(lobby.entryFeeUsdt));
    if (eligibility) return { ok: false, status: eligibility.status, error: eligibility.error };

    // slotNumber is permanently unique per lobby (@@unique([lobbyId,
    // slotNumber])) even for a participant who has since LEFT (see
    // leaveLobbySeat) — their row still exists, just with a different
    // status. joinedCount+1 assumed slots always fill in lockstep 1..4,
    // which broke the instant a seat could actually be vacated mid-
    // lobby: a new joiner could collide with a departed participant's
    // still-occupied slotNumber. Finding the smallest slot no existing
    // row (any status) already holds is correct regardless of how
    // fragmented the lobby's join/leave history is.
    const usedSlots = new Set(lobby.participants.map((p) => p.slotNumber));
    let nextSlot = 1;
    while (usedSlots.has(nextSlot)) nextSlot++;
    const entryFeeUsdt = Number(lobby.entryFeeUsdt);
    const claimResult = await db.$transaction(async (tx) => {
      // The version-based claim below already prevents two joins from
      // racing on the LOBBY itself, but it doesn't protect this
      // wallet's BALANCE — the same wallet could be joining two
      // different lobbies (or joining while withdrawing) at once, each
      // acquiring a different lobby's version claim. checkPaidEligibility
      // above already did a first-pass balance check, but unlocked;
      // re-checked here, after the lock, for the actual race-safe
      // guard (see lockWalletForBalanceChange's doc-comment).
      await lockWalletForBalanceChange(tx, walletProfile.id);
      if (entryFeeUsdt > 0) {
        const playUsdt = await getLedgerBalance(tx, walletProfile.id, BalanceType.PLAY_USDT);
        if (playUsdt < entryFeeUsdt) return { kind: "insufficient" as const };
      }

      const claim = await tx.gameLobby.updateMany({
        where: { id: lobbyId, version: lobby.version, status: lobby.status },
        data: { version: { increment: 1 } },
      });
      if (claim.count === 0) return { kind: "lost_race" as const };

      const holdLedgerId =
        entryFeeUsdt > 0
          ? await holdEntryFee(tx, {
              walletProfileId: walletProfile.id,
              entryFeeUsdt,
              lobbyId,
            })
          : null;
      await tx.lobbyParticipant.create({
        data: { lobbyId, walletProfileId: walletProfile.id, slotNumber: nextSlot, joinSource, entryHoldLedgerId: holdLedgerId },
      });
      // Total occupied seats after this join, not the slot NUMBER just
      // assigned — those diverge once a slot can be reused out of order
      // (see nextSlot's own doc-comment above).
      const newStatus = joinedCount + 1 >= LOBBY_MAX_PLAYERS ? "FULL" : lobby.status;
      const updated = await tx.gameLobby.update({ where: { id: lobbyId }, data: { status: newStatus } });
      return { kind: "joined" as const, lobby: updated };
    });

    if (claimResult.kind === "insufficient") {
      return { ok: false, status: 402, error: `You need at least ${entryFeeUsdt} USDT in your Deposit USDT to join this match.` };
    }
    if (claimResult.kind === "lost_race") continue; // retry against fresh state
    const claimedLobby = claimResult.lobby;

    // Notify the host the instant someone accepts — via whichever of
    // the three accept paths (direct invite, invitation, invite link)
    // got them here, they're never the host themselves (the host
    // already occupies slot 1 from POST /api/lobbies, never through
    // this function), so this is always a genuine "someone joined" event.
    if (lobby.hostWalletProfileId !== walletProfile.id) {
      await sendPushToWallet(lobby.hostWalletProfileId, {
        title: "Player joined your lobby",
        body: `${walletProfile.address.slice(0, 6)}…${walletProfile.address.slice(-4)} joined, ${nextSlot}/${LOBBY_MAX_PLAYERS} players.`,
        url: `/dashboard/play/lobby/${lobbyId}`,
      });
    }

    if (claimedLobby.status === "FULL") {
      await finalizeLobby(lobbyId); // spec section 15A: all 4 human seats filled — auto-start
    }
    return { ok: true, lobbyId };
  }
  return { ok: false, status: 409, error: "Could not join, please try again." };
}

export { round8 };
