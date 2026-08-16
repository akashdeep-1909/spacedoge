import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { BalanceType, GameMode } from "@/generated/prisma/enums";
import {
  GAME_MODE_CONFIG,
  botScore,
  maxPlausibleScore,
  rankBotMatch,
  rankByScore,
  rankKolBonusMatch,
  computeRankTierTargetsPts,
  rankTierResult,
  pickBotNames,
  shortenWalletAddress,
  computePoolSummary,
  round8,
} from "@/lib/game-config";
import { getPlatformTreasuryWalletProfileId } from "@/lib/treasury";
import { checkKolBonusEligibility } from "@/lib/referrals";

const bodySchema = z.object({
  score: z.number().int().min(0),
  durationPlayedSec: z.number().min(0),
});

const MIN_MATCH_SECONDS = 20; // anti-farming floor, mirrors the demo heuristic used elsewhere in this project

// How much slack the plausibility ceiling gives a genuine client beyond
// what the server itself can verify:
//  - CLOCK_SKEW_GRACE_SEC covers a client Date.now() that runs a little
//    fast relative to the server (used to compute startElapsedSec on
//    the client, see src/app/dashboard/play/page.tsx).
//  - DURATION_ROUNDING_GRACE_SEC covers Math.round() on the mission
//    clock and the ~1-2s gap between "mission clock hits 0" and this
//    request actually arriving.
// Deliberately NOT applied to the MIN_MATCH_SECONDS floor check below —
// see floorDurationSec's own comment for why that needs a looser bound.
const CLOCK_SKEW_GRACE_SEC = 10;
const DURATION_ROUNDING_GRACE_SEC = 2;

// POST /api/matches/[id]/settle
//
// KNOWN GAP vs doc section 18.1: the human player's score is still
// client-reported here, not derived from a server-authoritative replay
// of validated inputs — bot scores ARE server-computed (deterministic,
// seeded from mapSeed) so they can't be tampered with, but a human's
// own score can still be set to anything up to the plausibility
// ceiling below. What CAN be, and is, fully server-verified is the
// DURATION that ceiling is computed from (see effectiveDurationSec) —
// durationPlayedSec used to be trusted as-is, which made the ceiling
// self-referential (a forged duration validates a forged score against
// itself). This is NOT a substitute for the real-time authoritative
// server the doc requires before real money is at stake, but it closes
// the unbounded-console-fetch version of the exploit.
//
// Instant play is ALWAYS exactly 1 human + 3 bots (no lobby involved).
// For every paid mode, the solo-vs-bots anti-farming rule (rankBotMatch)
// applies unconditionally here — a human can never place 1st or 2nd in
// this route, only 3rd or 4th (randomized per match). See src/lib/
// game-config.ts's doc-comment above rankBotMatch/computeRankTier* for
// the full reward-tier design. PRACTICE is the one exception — see
// rankByScore's doc-comment for why the anti-farming guarantee doesn't
// apply there.
export async function POST(request: NextRequest, ctx: RouteContext<"/api/matches/[id]/settle">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id: matchId } = await ctx.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid settlement payload" }, { status: 400 });
  const { score, durationPlayedSec } = parsed.data;

  const match = await db.match.findUnique({
    where: { id: matchId },
    include: { participants: { include: { walletProfile: true } } },
  });
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  const me = match.participants.find(
    (p) => p.walletProfileId === session.walletProfileId && !p.isBot
  );
  if (!me) return NextResponse.json({ error: "You are not a participant in this match" }, { status: 403 });

  // resultsDeadlineAt is set only for lobby-originated matches (see
  // src/lib/lobby.ts finalizeLobby) — a lobby match participant must
  // use .../results instead. Without this check, any participant in a
  // multi-human room could call this single-shot route to stamp their
  // own score onto every other human and credit them for a match they
  // never submitted a result to.
  if (match.resultsDeadlineAt !== null) {
    return NextResponse.json({ error: "Use the multiplayer results endpoint for this match." }, { status: 409 });
  }

  const isKolBonus = match.mode === GameMode.KOL_REFERRAL_BONUS;

  // The duration THIS match was actually created under — never a
  // possibly-changed current admin config (src/lib/gameModes.ts). Null
  // only for rows created before durationSec existed on Match.
  const durationSec = match.durationSec ?? GAME_MODE_CONFIG[match.mode].durationSec;
  const isPractice = match.mode === GameMode.PRACTICE;

  // Two different bounds on the same client-reported durationPlayedSec,
  // because feeding the tight one into BOTH checks below would
  // regress a legitimate case: src/components/game/CoinRushArena.tsx's
  // finish() deliberately reports the full mission duration (not real
  // elapsed time) when a match ends early via all-ships-down, so a
  // genuine 15s death doesn't get wiped by MIN_MATCH_SECONDS. That
  // report is bounded by the match's own clock, not by server
  // wall-clock, so the floor check only needs the (still real, still
  // server-verified-by-durationSec) mission-length bound —
  // serverElapsedSec is what stops the actual exploit ("claim a huge
  // duration to inflate the plausibility ceiling"), so only the
  // ceiling calculation needs it.
  const serverElapsedSec = (Date.now() - (match.startedAt ?? match.createdAt).getTime()) / 1000;
  const effectiveDurationSec = Math.min(
    durationPlayedSec,
    serverElapsedSec + CLOCK_SKEW_GRACE_SEC,
    durationSec + DURATION_ROUNDING_GRACE_SEC
  );
  const floorDurationSec = Math.min(durationPlayedSec, durationSec + DURATION_ROUNDING_GRACE_SEC);

  let finalScore = score;
  let blockedReason: string | null = null;
  if (!isPractice) {
    const maxPossible = maxPlausibleScore(match.mode, effectiveDurationSec);
    if (floorDurationSec < MIN_MATCH_SECONDS) blockedReason = "Match too short to qualify for rewards.";
    else if (score > maxPossible) blockedReason = "Score outside plausible range.";
    if (blockedReason) finalScore = 0;
  }

  const outcome = await db.$transaction(async (tx) => {
    // Claim the settle step — doc section 18.1 "unique room ID, nonce,
    // result hash and idempotent settlement." Only one concurrent
    // request can ever win this (IN_MATCH -> PROVISIONAL, same
    // status-as-claim-guard pattern .../results/route.ts uses); a
    // second, concurrent call sees claim.count === 0 and returns the
    // already-computed result instead of re-crediting anything. Without
    // this, two Promise.all'd requests both read status === "IN_MATCH"
    // (the old check ran before this transaction even opened) and both
    // ran the full settlement, double-crediting one entry fee.
    const claim = await tx.match.updateMany({ where: { id: match.id, status: "IN_MATCH" }, data: { status: "PROVISIONAL" } });
    if (claim.count === 0) return { kind: "already_claimed" as const };

    // Score every participant: the caller's reported (and possibly
    // zeroed) score, and deterministic bot scores.
    const scored = await Promise.all(
      match.participants.map(async (p) => {
        const participantScore = p.isBot
          ? botScore(match.mapSeed, match.participants.indexOf(p), durationSec)
          : finalScore;
        await tx.matchParticipant.update({
          where: { id: p.id },
          data: { score: participantScore },
        });
        return { ...p, score: participantScore };
      })
    );

    // Solo-vs-bots rule: this route is always 1 human + 3 bots, so
    // outside Practice the human is guaranteed rank 3 or 4 here — never
    // 1st or 2nd. The KOL referral gift is stricter still — every bot is
    // guaranteed above the human (rankKolBonusMatch), so the human is
    // always last. Practice ranks purely by score instead (rankByScore)
    // — no reward ever reaches a wallet from this mode, so there's
    // nothing for the anti-farming guarantee to protect, and always
    // capping a solo practice player at 3rd/4th regardless of how well
    // they played read as unfair for a mode that's supposed to be a
    // genuine skill check.
    const ranked = isPractice
      ? rankByScore(scored)
      : isKolBonus
        ? rankKolBonusMatch(scored, match.mapSeed)
        : rankBotMatch(scored, match.mapSeed);
    const myRank = ranked.find((p) => p.id === me.id)?.rank ?? 4;

    // KOL_REFERRAL_BONUS reward is score-based and rank-independent —
    // no real entry-fee-funded pool underlies this mode, so the
    // rank-tier prize-split system below doesn't apply. Credit the
    // human's own raw score directly as PTS, clamped by whatever's left
    // of their shared 300-PTS lifetime cap (checkKolBonusEligibility
    // read INSIDE this transaction for a consistent view of "earned so
    // far," closing the double-settle race the mode-scoped busy-check
    // in the creation route already narrows). Any excess the cap
    // clamps away simply isn't paid — there's no pool it could have
    // come from, so unlike the paid modes' "unclaimed" surplus, nothing
    // flows to the treasury here.
    if (isKolBonus) {
      const kol = await checkKolBonusEligibility(me.walletProfileId, tx);
      const rewardPts = blockedReason ? 0 : Math.min(finalScore, kol.ptsCapRemaining);
      const rewardUsdt = rewardPts / 1000;

      for (const p of ranked) {
        await tx.matchParticipant.update({
          where: { id: p.id },
          data: {
            rank: p.rank,
            score: p.score,
            rewardUsdt: p.id === me.id ? rewardUsdt : 0,
            resultBlockedReason: p.id === me.id ? blockedReason : undefined,
          },
        });
      }
      if (rewardPts > 0) {
        await tx.ledgerEntry.create({
          data: {
            walletProfileId: me.walletProfileId,
            balanceType: BalanceType.PTS,
            amount: rewardPts,
            reason: "kol_referral_bonus",
            refType: "Match",
            refId: match.id,
          },
        });
      }
      await tx.match.update({
        where: { id: match.id },
        data: { status: rewardUsdt > 0 ? "SETTLED_WIN" : "SETTLED_LOSS", endedAt: new Date() },
      });
      return {
        kind: "settled" as const,
        myRank,
        myReward: { rank: myRank, targetPts: 0, gameplayPts: finalScore, bonusPts: 0, rewardPts, rewardUsdt },
      };
    }

    // v3 economy: reward pool = 70% of total entries, converted 1000
    // PTS = $1, split into fixed per-rank targets (13/28, 9/28, 6/28 —
    // see game-config.ts). rewardUsdt/PTS are the dollar-equivalent
    // value credited as PTS — never itself a directly held USDT
    // balance. Referral commission is sized off the platform fee at
    // match entry instead, see src/app/api/matches/route.ts.
    const targets = computeRankTierTargetsPts(Number(match.prizePoolUsdt), match.mapSeed);
    let myReward = { rank: myRank, targetPts: 0, gameplayPts: finalScore, bonusPts: 0, rewardPts: 0, rewardUsdt: 0 };
    let unclaimedUsdt = 0;

    for (const p of ranked) {
      const result = rankTierResult(p.rank, p.score, targets);
      const isMe = p.id === me.id;
      const humanBlocked = isMe && !!blockedReason;
      // Display value (stored on the row, shown in the results UI):
      // everyone's actual tier reward, bots included — spec: "Bot
      // players can appear in the ranking table with their calculated
      // PTS." Only a blocked human's own row (or Practice) shows 0,
      // matching the existing "implausible/too-short forfeits the
      // reward" anti-cheat intent.
      const displayRewardUsdt = isPractice || humanBlocked ? 0 : result.rewardUsdt;
      // Ledger credit (real money): only ever a real human, never a
      // bot — bots display their tier value but are never actually
      // paid it (no real wallet holds a bot's balance).
      const creditable = !p.isBot && !isPractice && !humanBlocked;

      await tx.matchParticipant.update({
        where: { id: p.id },
        // score may have been bumped by rankBotMatch (a guaranteed bot
        // displaying more PTS than it actually simulated) — persisted
        // here so the DB row (and everything read back from it after
        // this transaction) matches what's shown, not the pre-bump value
        // written during the scoring step above.
        data: isPractice
          ? { rank: p.rank, score: p.score }
          : { rank: p.rank, rewardUsdt: displayRewardUsdt, score: p.score, resultBlockedReason: isMe ? blockedReason : undefined },
      });

      if (creditable && displayRewardUsdt > 0) {
        await tx.ledgerEntry.create({
          data: {
            walletProfileId: p.walletProfileId,
            balanceType: BalanceType.PTS,
            amount: displayRewardUsdt * 1000,
            reason: "match_settlement",
            refType: "Match",
            refId: match.id,
          },
        });
      }
      if (!creditable) {
        unclaimedUsdt = round8(unclaimedUsdt + result.rewardUsdt);
      }

      if (isMe) myReward = { ...result, rewardUsdt: displayRewardUsdt };
    }

    // Unclaimed reward-tier value (bot-held winning slots, a blocked
    // score, or Practice) never just vanishes from the ledger — same
    // "leftover prize pool accounted for" precedent as the lobby path
    // (src/app/api/matches/[id]/results/route.ts's match_unused_prize_
    // surplus), credited to the platform treasury.
    if (!isPractice && unclaimedUsdt > 0) {
      const treasuryWalletProfileId = await getPlatformTreasuryWalletProfileId(tx);
      await tx.ledgerEntry.create({
        data: {
          walletProfileId: treasuryWalletProfileId,
          balanceType: BalanceType.PLATFORM_FEE_USDT,
          amount: unclaimedUsdt,
          reason: "match_unused_prize_surplus",
          refType: "Match",
          refId: match.id,
        },
      });
    }

    await tx.match.update({
      where: { id: match.id },
      data: {
        status: myReward.rewardUsdt > 0 ? "SETTLED_WIN" : "SETTLED_LOSS",
        endedAt: new Date(),
      },
    });

    return { kind: "settled" as const, myRank, myReward };
  });

  // A concurrent request already won the claim (see the updateMany
  // above) — re-read the now-settled state fresh from the DB (not the
  // possibly-stale `match`/`me` fetched at the top of this request) and
  // return the same shape a genuinely-late "already settled" call
  // always has, instead of crediting anything a second time.
  if (outcome.kind === "already_claimed") {
    const [freshMatch, freshMe, already] = await Promise.all([
      db.match.findUniqueOrThrow({ where: { id: match.id } }),
      db.matchParticipant.findUniqueOrThrow({ where: { id: me.id } }),
      db.matchParticipant.findMany({
        where: { matchId: match.id },
        include: { walletProfile: true },
        orderBy: { rank: "asc" },
      }),
    ]);
    return NextResponse.json({
      matchId: match.id,
      status: freshMatch.status,
      rank: freshMe.rank,
      score: freshMe.score,
      rewardUsdt: Number(freshMe.rewardUsdt),
      alreadySettled: true,
      participants: buildParticipantSummaries(already, session.walletProfileId, match.mapSeed),
      pool: computePoolSummary(Number(freshMatch.entryFeeUsdt), Number(freshMatch.platformFeeUsdt), Number(freshMatch.prizePoolUsdt)),
      kolBonus: isKolBonus ? await checkKolBonusEligibility(session.walletProfileId) : null,
    });
  }

  const finalParticipants = await db.matchParticipant.findMany({
    where: { matchId: match.id },
    include: { walletProfile: true },
    orderBy: { rank: "asc" },
  });

  return NextResponse.json({
    matchId: match.id,
    mode: match.mode,
    rank: outcome.myRank,
    score: finalScore,
    rewardUsdt: outcome.myReward.rewardUsdt,
    bonusPts: outcome.myReward.bonusPts,
    blockedReason,
    isPractice,
    participants: buildParticipantSummaries(finalParticipants, session.walletProfileId, match.mapSeed),
    pool: computePoolSummary(Number(match.entryFeeUsdt), Number(match.platformFeeUsdt), Number(match.prizePoolUsdt)),
    kolBonus: isKolBonus ? await checkKolBonusEligibility(session.walletProfileId) : null,
  });
}

// Shared response shape between this route and .../results/route.ts —
// duplicated here (route modules aren't meant to be imported from,
// same convention as the anti-cheat constant comment used to explain)
// rather than centralized, since the two callers' surrounding data
// (Prisma includes) already differ slightly.
function buildParticipantSummaries(
  participants: { id: string; isBot: boolean; walletProfileId: string; score: number; rank: number | null; rewardUsdt: unknown; walletProfile: { address: string; nickname: string | null } }[],
  myWalletProfileId: string,
  mapSeed: string
) {
  const sorted = participants.slice().sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  // One shuffle per match, not per bot — guarantees no two bots in the
  // same room ever get the same name (see pickBotNames' doc-comment).
  const botNames = pickBotNames(mapSeed, sorted.filter((p) => p.isBot).length);
  let botIndex = 0;
  return sorted.map((p) => {
    const rewardUsdt = Number(p.rewardUsdt);
    const rewardPts = Math.round(rewardUsdt * 1000);
    const bonusPts = Math.max(0, rewardPts - p.score);
    return {
      rank: p.rank ?? 4,
      isBot: p.isBot,
      isYou: p.walletProfileId === myWalletProfileId,
      displayAddress: p.isBot
        ? `@${botNames[botIndex++]}`
        : p.walletProfile.nickname || shortenWalletAddress(p.walletProfile.address),
      gameplayPts: p.score,
      bonusPts,
      rewardPts,
      rewardUsdt,
    };
  });
}

