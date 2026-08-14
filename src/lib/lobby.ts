import { randomBytes, createHash } from "node:crypto";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { BalanceType, GameMode } from "@/generated/prisma/enums";
import { GAME_MODE_CONFIG, botScore } from "@/lib/game-config";
import { getGameModeConfigs, getGameModeConfig, computeRoomEconomicsFromConfig } from "@/lib/gameModes";
import { distributeEntryFeeToTreasuryAndReferrals } from "@/lib/referrals";
import { getWalletBalances } from "@/lib/balances";
import { sendPushToWallet } from "@/lib/push";
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
// can never both "succeed."
export async function cancelLobby(lobbyId: string): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const lobby = await tx.gameLobby.findUnique({ where: { id: lobbyId }, include: { participants: true } });
    if (!lobby || (lobby.status !== "WAITING" && lobby.status !== "FULL")) return false;

    const claimed = await tx.gameLobby.updateMany({
      where: { id: lobbyId, version: lobby.version, status: { in: ["WAITING", "FULL"] } },
      data: { status: "CANCELLED", cancelledAt: new Date(), version: { increment: 1 } },
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
        include: { walletProfile: { select: { address: true, nickname: true } } },
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
    host: { address: lobby.host.address },
    isHost: viewerWalletProfileId === lobby.hostWalletProfileId,
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
    serverTime: new Date(),
  };
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

    const nextSlot = joinedCount + 1;
    const claimedLobby = await db.$transaction(async (tx) => {
      const claim = await tx.gameLobby.updateMany({
        where: { id: lobbyId, version: lobby.version, status: lobby.status },
        data: { version: { increment: 1 } },
      });
      if (claim.count === 0) return null; // lost the race — someone else changed the lobby first

      const holdLedgerId =
        Number(lobby.entryFeeUsdt) > 0
          ? await holdEntryFee(tx, {
              walletProfileId: walletProfile.id,
              entryFeeUsdt: Number(lobby.entryFeeUsdt),
              lobbyId,
            })
          : null;
      await tx.lobbyParticipant.create({
        data: { lobbyId, walletProfileId: walletProfile.id, slotNumber: nextSlot, joinSource, entryHoldLedgerId: holdLedgerId },
      });
      const newStatus = nextSlot >= LOBBY_MAX_PLAYERS ? "FULL" : lobby.status;
      return tx.gameLobby.update({ where: { id: lobbyId }, data: { status: newStatus } });
    });

    if (!claimedLobby) continue; // retry against fresh state

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
