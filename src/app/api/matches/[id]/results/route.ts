import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { BalanceType } from "@/generated/prisma/enums";
import {
  GAME_MODE_CONFIG,
  maxPlausibleScore,
  rankBotMatch,
  computeRankTierTargetsPts,
  rankTierResult,
  pickBotNames,
  shortenWalletAddress,
  computePoolSummary,
  round8,
} from "@/lib/game-config";
import { botScoreForSlot } from "@/lib/lobby";
import { getPlatformTreasuryWalletProfileId } from "@/lib/treasury";

const bodySchema = z.object({
  score: z.number().int().min(0),
  durationPlayedSec: z.number().min(0),
});

// The plausibility ceiling itself lives in src/lib/game-config.ts
// (maxPlausibleScore, mode-aware) rather than being duplicated here as a
// flat constant — that duplication is exactly what let this route's copy
// go stale relative to settle/route.ts's.
const MIN_MATCH_SECONDS = 20;

// Same grace constants, same reasoning, as settle/route.ts — see that
// file's doc-comment above these two constants for the full rationale.
const CLOCK_SKEW_GRACE_SEC = 10;
const DURATION_ROUNDING_GRACE_SEC = 2;

// POST /api/matches/[id]/results — multi-human result submission for
// lobby-originated matches (see src/lib/lobby.ts finalizeLobby()).
// src/app/api/matches/[id]/settle/route.ts stays the single-shot path
// for instant play (always exactly 1 human) — untouched by this route,
// per the spec's "preserve this for normal instant play."
//
// A lobby match can ALSO end up 1 human + 3 bots (nobody accepted an
// invite before the lobby auto-filled with AI) — the same solo-vs-bots
// anti-farming rule from settle/route.ts applies here too whenever that
// happens (rankBotMatch detects it by counting real participants, not
// by which route is calling it). A lobby with 2+ real humans ranks
// purely by score, unaffected. See src/lib/game-config.ts's doc-comment
// above rankBotMatch/computeRankTier* for the full reward-tier design.
//
// Each human calls this independently with their own score. Finalization
// (ranking, PTS reward, unused-surplus accounting) happens exactly once,
// either when every human has submitted or once the match's
// resultsDeadlineAt passes (a human who never submits by then is scored
// 0 — a documented policy default for a case the spec doesn't fully
// specify). Concurrency-safe: only one submitting request can ever win
// the finalize step, via the same Match.status-as-claim-guard pattern
// src/lib/lobby.ts's finalizeLobby() uses (IN_MATCH -> PROVISIONAL is
// the claim; PROVISIONAL was already an unused enum value reserved for
// exactly this kind of "being processed" transitional state).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id: matchId } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid results payload" }, { status: 400 });
  const { score, durationPlayedSec } = parsed.data;

  const outcome = await db.$transaction(async (tx) => {
    const match = await tx.match.findUnique({ where: { id: matchId }, include: { participants: true } });
    if (!match) return { kind: "not_found" as const };

    const me = match.participants.find((p) => p.walletProfileId === session.walletProfileId && !p.isBot);
    if (!me) return { kind: "forbidden" as const };

    // resultsDeadlineAt is set only for lobby-originated matches (see
    // src/lib/lobby.ts finalizeLobby) — an instant-play match (always
    // exactly 1 human) must use .../settle instead, which applies its
    // own solo-vs-bots anti-farming cap that this route's no-bot branch
    // doesn't have.
    if (match.resultsDeadlineAt === null) {
      return { kind: "invalid_status" as const, status: match.status };
    }

    // The duration THIS match was actually created under (lobby-
    // originated matches always have it set, see src/lib/lobby.ts
    // finalizeLobby) — never a possibly-changed current admin config.
    const durationSec = match.durationSec ?? GAME_MODE_CONFIG[match.mode].durationSec;
    // Two different bounds on the same client-reported durationPlayedSec
    // — see settle/route.ts's identical constants/comment for the full
    // rationale (a genuine early-finish report must only ever be capped
    // by the mission clock, not by server wall-clock, or a legitimate
    // no-show-adjacent score gets wrongly zeroed by MIN_MATCH_SECONDS).
    const serverElapsedSec = (Date.now() - (match.startedAt ?? match.createdAt).getTime()) / 1000;
    const effectiveDurationSec = Math.min(
      durationPlayedSec,
      serverElapsedSec + CLOCK_SKEW_GRACE_SEC,
      durationSec + DURATION_ROUNDING_GRACE_SEC
    );
    const floorDurationSec = Math.min(durationPlayedSec, durationSec + DURATION_ROUNDING_GRACE_SEC);

    if (match.status === "SETTLED") {
      const mine = await tx.matchParticipant.findUniqueOrThrow({ where: { id: me.id } });
      const all = await tx.matchParticipant.findMany({
        where: { matchId: match.id },
        include: { walletProfile: true },
        orderBy: { rank: "asc" },
      });
      return { kind: "settled" as const, participant: mine, all, match, blockedReason: mine.resultBlockedReason };
    }
    if (match.status !== "IN_MATCH") {
      return { kind: "invalid_status" as const, status: match.status };
    }

    let blockedReason: string | null = null;
    if (!me.resultSubmittedAt) {
      const maxPossible = maxPlausibleScore(match.mode, effectiveDurationSec);
      if (floorDurationSec < MIN_MATCH_SECONDS) blockedReason = "Match too short to qualify for rewards.";
      else if (score > maxPossible) blockedReason = "Score outside plausible range.";
      const scoreToStore = blockedReason ? 0 : score;
      await tx.matchParticipant.update({
        where: { id: me.id },
        data: { score: scoreToStore, resultSubmittedAt: new Date(), resultBlockedReason: blockedReason },
      });
    }

    const refreshed = await tx.matchParticipant.findMany({ where: { matchId: match.id } });
    const humans = refreshed.filter((p) => !p.isBot);
    const allSubmitted = humans.every((p) => p.resultSubmittedAt !== null);
    const deadlinePassed = match.resultsDeadlineAt ? Date.now() >= match.resultsDeadlineAt.getTime() : false;
    // Read off the freshly-refetched row (not the local `blockedReason`
    // var, which is only set on the specific request that performed
    // this participant's own first submission) so a "still waiting on
    // others" poll after that keeps showing why a blocked score scored 0.
    const myBlockedReason = refreshed.find((p) => p.id === me.id)?.resultBlockedReason ?? null;

    if (!allSubmitted && !deadlinePassed) {
      return {
        kind: "waiting" as const,
        submitted: humans.filter((p) => p.resultSubmittedAt !== null).length,
        total: humans.length,
        blockedReason: myBlockedReason,
      };
    }

    // Claim the finalize step — only one concurrent request can win this.
    const claim = await tx.match.updateMany({ where: { id: match.id, status: "IN_MATCH" }, data: { status: "PROVISIONAL" } });
    if (claim.count === 0) {
      return {
        kind: "waiting" as const,
        submitted: humans.filter((p) => p.resultSubmittedAt !== null).length,
        total: humans.length,
        blockedReason: myBlockedReason,
      };
    }

    // durationSec was already computed above (needed there for the
    // plausibility clamp) — reused here for bot scoring.
    const scoredParticipants = await Promise.all(
      refreshed.map(async (p) => {
        if (p.isBot) {
          const botScoreValue = botScoreForSlot(match.mapSeed, p.slotNumber ?? 0, durationSec);
          await tx.matchParticipant.update({ where: { id: p.id }, data: { score: botScoreValue } });
          return { ...p, score: botScoreValue };
        }
        if (p.resultSubmittedAt === null) {
          // No-show by the results deadline — scored 0, ranked last (see
          // rankBotMatch's noShow handling), and never paid a rank-tier
          // reward regardless of where it lands (see rewardBlocked
          // below) — without that, a human who simply never finishes
          // could still collect a guaranteed top-3 payout whenever the
          // other real players also happened to score low or no-show,
          // which is exactly backwards: not finishing should never beat
          // someone who actually played, even if they played badly.
          await tx.matchParticipant.update({ where: { id: p.id }, data: { score: 0, resultSubmittedAt: new Date() } });
          return { ...p, score: 0, resultBlockedReason: null, noShow: true };
        }
        return p;
      })
    );

    // rankBotMatch auto-detects solo-vs-bots (exactly 1 real human among
    // the 4) vs a genuine multi-human room and ranks accordingly — see
    // its doc-comment in game-config.ts.
    const ranked = rankBotMatch(scoredParticipants, match.mapSeed);
    const prizePoolUsdt = Number(match.prizePoolUsdt);
    const targets = computeRankTierTargetsPts(prizePoolUsdt, match.mapSeed);

    let unclaimedUsdt = 0;
    for (const p of ranked) {
      const result = rankTierResult(p.rank, p.score, targets);
      // A no-show is treated exactly like a blocked score for reward
      // purposes (see the no-show branch above) — never paid, even if
      // rankBotMatch's noShow-last ordering still left it landing on a
      // rank 1-3 slot because too few real participants actually played.
      const rewardBlocked = !p.isBot && (!!p.resultBlockedReason || !!("noShow" in p && p.noShow));
      // Display value (stored on the row, shown in the results UI):
      // everyone's actual tier reward, bots included — spec: "Bot
      // players can appear in the ranking table with their calculated
      // PTS." Only a blocked/no-show human's own row shows 0.
      const displayRewardUsdt = rewardBlocked ? 0 : result.rewardUsdt;
      // Ledger credit (real money): only ever a real, non-blocked,
      // non-no-show human.
      const creditable = !p.isBot && !rewardBlocked;

      // score may have been bumped by rankBotMatch (a guaranteed bot
      // displaying more PTS than it actually simulated) — persisted here
      // so the DB row matches what's shown, not the pre-bump value
      // written during the scoring step above.
      await tx.matchParticipant.update({ where: { id: p.id }, data: { rank: p.rank, rewardUsdt: displayRewardUsdt, score: p.score } });
      if (creditable && displayRewardUsdt > 0) {
        await tx.ledgerEntry.create({
          data: {
            walletProfileId: p.walletProfileId,
            balanceType: BalanceType.PTS,
            amount: round8(displayRewardUsdt * 1000),
            reason: "match_settlement",
            refType: "Match",
            refId: match.id,
          },
        });
      }
      if (!creditable) {
        unclaimedUsdt = round8(unclaimedUsdt + result.rewardUsdt);
      }
    }

    // Any reward-tier value nobody real actually claimed (bot-held
    // winning slots, or a blocked score) is accounted for explicitly,
    // not silently discarded — credited to the treasury under its own
    // reason code. The fixed-tier targets always sum to exactly the
    // reward pool (see computeRankTierTargetsPts), so this is precisely
    // "what a bot or a blocked human would otherwise have taken."
    if (unclaimedUsdt > 0) {
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

    await tx.match.update({ where: { id: match.id }, data: { status: "SETTLED", endedAt: new Date() } });

    const mine = await tx.matchParticipant.findUniqueOrThrow({ where: { id: me.id } });
    const all = await tx.matchParticipant.findMany({
      where: { matchId: match.id },
      include: { walletProfile: true },
      orderBy: { rank: "asc" },
    });
    return { kind: "settled" as const, participant: mine, all, match, blockedReason };
  });

  switch (outcome.kind) {
    case "not_found":
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    case "forbidden":
      return NextResponse.json({ error: "You are not a participant in this match" }, { status: 403 });
    case "invalid_status":
      return NextResponse.json({ error: `Match is not accepting results (status: ${outcome.status})` }, { status: 409 });
    case "waiting":
      return NextResponse.json({
        status: "waiting_for_others",
        submitted: outcome.submitted,
        total: outcome.total,
        blockedReason: outcome.blockedReason,
      });
    case "settled": {
      const rewardUsdt = Number(outcome.participant.rewardUsdt);
      const rewardPts = Math.round(rewardUsdt * 1000);
      return NextResponse.json({
        matchId,
        status: "settled",
        rank: outcome.participant.rank,
        score: outcome.participant.score,
        rewardUsdt,
        bonusPts: Math.max(0, rewardPts - outcome.participant.score),
        // Read off the freshly-refetched participant row, not the local
        // `blockedReason` closure var — that var is only ever set on the
        // specific request that performed THIS participant's own first
        // submission, so a later poll that merely observes finalization
        // (everyone else has now submitted) would otherwise silently
        // report null even for a participant whose own score really was
        // blocked earlier in the match.
        blockedReason: outcome.participant.resultBlockedReason,
        pool: computePoolSummary(
          Number(outcome.match.entryFeeUsdt),
          Number(outcome.match.platformFeeUsdt),
          Number(outcome.match.prizePoolUsdt)
        ),
        participants: (() => {
          // One shuffle per match, not per bot — guarantees no two bots
          // in the same room ever get the same name.
          const botNames = pickBotNames(outcome.match.mapSeed, outcome.all.filter((p) => p.isBot).length);
          let botIndex = 0;
          return outcome.all.map((p) => {
            const pRewardUsdt = Number(p.rewardUsdt);
            const pRewardPts = Math.round(pRewardUsdt * 1000);
            return {
              rank: p.rank ?? 4,
              isBot: p.isBot,
              isYou: p.walletProfileId === session.walletProfileId,
              displayAddress: p.isBot
                ? `@${botNames[botIndex++]}`
                : p.walletProfile.nickname || shortenWalletAddress(p.walletProfile.address),
              gameplayPts: p.score,
              bonusPts: Math.max(0, pRewardPts - p.score),
              rewardPts: pRewardPts,
              rewardUsdt: pRewardUsdt,
            };
          });
        })(),
      });
    }
  }
}
