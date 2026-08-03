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

// POST /api/matches/[id]/settle
//
// KNOWN GAP vs doc section 18.1: the human player's score is
// client-reported here, not derived from a server-authoritative replay
// of validated inputs. Bot scores ARE server-computed (deterministic,
// seeded from mapSeed) so they can't be tampered with, and the
// duration/plausibility checks below block the crudest score-editing.
// This is NOT a substitute for the real-time authoritative server the
// doc requires before real money is at stake.
//
// Instant play is ALWAYS exactly 1 human + 3 bots (no lobby involved),
// so the solo-vs-bots anti-farming rule (rankBotMatch) applies
// unconditionally here — a human can never place 1st or 2nd in this
// route, only 3rd or 4th (randomized per match). See src/lib/
// game-config.ts's doc-comment above rankBotMatch/computeRankTier* for
// the full reward-tier design.
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

  // Idempotent settlement — doc section 18.1 "unique room ID, nonce,
  // result hash and idempotent settlement." A second call just returns
  // the already-computed result instead of re-crediting anything.
  const isKolBonus = match.mode === GameMode.KOL_REFERRAL_BONUS;

  if (match.status !== "IN_MATCH") {
    const already = await db.matchParticipant.findMany({
      where: { matchId: match.id },
      include: { walletProfile: true },
      orderBy: { rank: "asc" },
    });
    return NextResponse.json({
      matchId: match.id,
      status: match.status,
      rank: me.rank,
      score: me.score,
      rewardUsdt: Number(me.rewardUsdt),
      alreadySettled: true,
      participants: buildParticipantSummaries(already, session.walletProfileId, match.mapSeed),
      pool: computePoolSummary(Number(match.entryFeeUsdt), Number(match.platformFeeUsdt), Number(match.prizePoolUsdt)),
      kolBonus: isKolBonus ? await checkKolBonusEligibility(session.walletProfileId) : null,
    });
  }

  // The duration THIS match was actually created under — never a
  // possibly-changed current admin config (src/lib/gameModes.ts). Null
  // only for rows created before durationSec existed on Match.
  const durationSec = match.durationSec ?? GAME_MODE_CONFIG[match.mode].durationSec;
  const isPractice = match.mode === GameMode.PRACTICE;

  let finalScore = score;
  let blockedReason: string | null = null;
  if (!isPractice) {
    const maxPossible = maxPlausibleScore(match.mode, durationPlayedSec);
    if (durationPlayedSec < MIN_MATCH_SECONDS) blockedReason = "Match too short to qualify for rewards.";
    else if (score > maxPossible) blockedReason = "Score outside plausible range.";
    if (blockedReason) finalScore = 0;
  }

  const settled = await db.$transaction(async (tx) => {
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

    // Solo-vs-bots rule: this route is always 1 human + 3 bots, so the
    // human is guaranteed rank 3 or 4 here — never 1st or 2nd. The KOL
    // referral gift is stricter still — every bot is guaranteed above
    // the human (rankKolBonusMatch), so the human is always last.
    const ranked = isKolBonus ? rankKolBonusMatch(scored, match.mapSeed) : rankBotMatch(scored, match.mapSeed);
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
          data: { rank: p.rank, score: p.score, rewardUsdt: p.id === me.id ? rewardUsdt : 0 },
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
        data: isPractice ? { rank: p.rank, score: p.score } : { rank: p.rank, rewardUsdt: displayRewardUsdt, score: p.score },
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

    return { myRank, myReward };
  });

  const finalParticipants = await db.matchParticipant.findMany({
    where: { matchId: match.id },
    include: { walletProfile: true },
    orderBy: { rank: "asc" },
  });

  return NextResponse.json({
    matchId: match.id,
    mode: match.mode,
    rank: settled.myRank,
    score: finalScore,
    rewardUsdt: settled.myReward.rewardUsdt,
    bonusPts: settled.myReward.bonusPts,
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

