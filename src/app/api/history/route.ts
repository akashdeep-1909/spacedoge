import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

// GET /api/history?tab=game|mining|conversion|withdrawals — doc section
// 15.2: "History tabs: Game, Mining, Conversion, Withdrawals and
// Referrals." Referrals already has its own endpoint (/api/referrals)
// with richer qualification-progress data, so it isn't duplicated here.
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const tab = request.nextUrl.searchParams.get("tab");
  const walletProfileId = session.walletProfileId;

  if (tab === "game") {
    const participants = await db.matchParticipant.findMany({
      where: { walletProfileId, isBot: false },
      include: { match: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({
      rows: participants.map((p) => {
        const rewardUsdt = Number(p.rewardUsdt);
        // Reward is a fixed per-rank target (src/lib/game-config.ts
        // computeRankTierTargetsPts), not directly derived from score —
        // bonusPts is however much of that target was topped up beyond
        // the raw gameplay score, same formula used everywhere else
        // this shows (settle/results routes, MatchResultReveal).
        const rewardPts = Math.round(rewardUsdt * 1000);
        const bonusPts = Math.max(0, rewardPts - p.score);
        return {
          matchId: p.matchId,
          mode: p.match.mode,
          status: p.match.status,
          score: p.score,
          rank: p.rank,
          rewardUsdt,
          rewardPts,
          bonusPts,
          createdAt: p.createdAt,
          endedAt: p.match.endedAt,
        };
      }),
    });
  }

  if (tab === "mining") {
    const [contracts, allocations] = await Promise.all([
      db.miningContract.findMany({
        where: { walletProfileId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      db.miningAllocation.findMany({
        where: { walletProfileId },
        include: { epoch: { select: { epochDate: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);
    return NextResponse.json({
      contracts: contracts.map((c) => ({
        id: c.id,
        level: c.level,
        miningPower: Number(c.miningPower),
        termDays: c.termDays,
        pricePaidUsdt: Number(c.pricePaidUsdt),
        source: Number(c.pricePaidUsdt) > 0 ? "Mining Power Purchase" : "Referral Bonus MP",
        startsAt: c.startsAt,
        expiresAt: c.expiresAt,
        createdAt: c.createdAt,
      })),
      allocations: allocations.map((a) => ({
        id: a.id,
        epochDate: a.epoch.epochDate,
        effectiveMp: Number(a.effectiveMp),
        dogeAllocated: Number(a.dogeAllocated),
        createdAt: a.createdAt,
      })),
    });
  }

  if (tab === "conversion") {
    const entries = await db.ledgerEntry.findMany({
      where: { walletProfileId, reason: "doge_to_usdt_conversion" },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json({
      rows: entries.map((e) => ({
        id: e.id,
        balanceType: e.balanceType,
        amount: Number(e.amount),
        createdAt: e.createdAt,
      })),
    });
  }

  if (tab === "withdrawals") {
    const rows = await db.withdrawal.findMany({
      where: { walletProfileId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({
      rows: rows.map((w) => ({
        id: w.id,
        source: w.balanceType,
        chain: w.chain,
        amount: Number(w.amount),
        status: w.status,
        txHash: w.txHash,
        createdAt: w.createdAt,
      })),
    });
  }

  return NextResponse.json({ error: "Unknown tab" }, { status: 400 });
}
