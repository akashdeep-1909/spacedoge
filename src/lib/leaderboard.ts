import { db } from "@/lib/db";
import { BalanceType } from "@/generated/prisma/enums";
import { PRIZE_SPLIT, prizeForRank } from "@/lib/game-config";
import { getWeeklyLeaderboardConfig } from "@/lib/settings";

export interface LeaderboardResult {
  walletProfileId: string;
  address: string;
  nickname: string | null;
  rank: number;
  score: number;
  rewardUsdt: number;
}

function mondayUtc(d: Date): Date {
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() + diff);
  return monday;
}

export function currentWeekBounds(now = new Date()) {
  const weekStart = mondayUtc(now);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { weekStart, weekEnd };
}

export function previousWeekBounds(now = new Date()) {
  const { weekStart: currentStart } = currentWeekBounds(now);
  const weekStart = new Date(currentStart.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { weekStart, weekEnd: currentStart };
}

async function rankWeek(weekStart: Date, weekEnd: Date, poolUsdt: number): Promise<LeaderboardResult[]> {
  const grouped = await db.matchParticipant.groupBy({
    by: ["walletProfileId"],
    where: {
      isBot: false,
      match: {
        // Only real entry-fee rooms — Sponsored Drop / Forge Cup already
        // pay out from their own pre-funded pool, doubling into the
        // weekly leaderboard pool too would be a second payout for the
        // same match.
        mode: { in: ["QUICK_RUSH", "EXPLORER_RUSH", "PRO_RUSH", "ELITE_RUSH", "CHAMPION_RUSH"] },
        // SETTLED_WIN/SETTLED_LOSS cover instant play; SETTLED covers
        // lobby-originated ("Play with Friends") matches — a separate
        // terminal status added for multiplayer (see MatchStatus in
        // schema.prisma) that this query was never updated to include,
        // which silently excluded every lobby match's score from ever
        // counting toward the weekly leaderboard.
        status: { in: ["SETTLED_WIN", "SETTLED_LOSS", "SETTLED"] },
        endedAt: { gte: weekStart, lt: weekEnd },
      },
    },
    _sum: { score: true },
  });

  if (grouped.length === 0) return [];

  const wallets = await db.walletProfile.findMany({
    where: { id: { in: grouped.map((g) => g.walletProfileId) } },
    select: { id: true, address: true, nickname: true },
  });
  const walletById = new Map(wallets.map((w) => [w.id, w]));

  return grouped
    .map((g) => ({ walletProfileId: g.walletProfileId, score: g._sum.score ?? 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((g, i) => ({
      walletProfileId: g.walletProfileId,
      address: walletById.get(g.walletProfileId)?.address ?? "",
      nickname: walletById.get(g.walletProfileId)?.nickname ?? null,
      rank: i + 1,
      score: g.score,
      rewardUsdt: prizeForRank(poolUsdt, i + 1),
    }));
}

// Finalizes (scores + pays, if configured) the given past week exactly
// once. Safe to call on every request — `weekStart` uniqueness makes
// this idempotent, same pattern as ensureTodayEpoch(). Only actually
// credits winners when an admin has both enabled the reward and set a
// pool amount (src/lib/settings.ts's getWeeklyLeaderboardConfig) —
// otherwise this still records the week's real rankings, it just pays
// nothing. A week finalized before the admin turns rewards on stays
// unpaid forever (finalizing is a one-time lock-in, not retried), which
// is the intended behavior — enabling rewards only affects weeks that
// haven't ended yet.
export async function ensureWeekFinalized(weekStart: Date, weekEnd: Date) {
  const existing = await db.weeklyLeaderboardPayout.findUnique({ where: { weekStart } });
  if (existing) return existing;

  const { enabled, poolUsdt } = await getWeeklyLeaderboardConfig();
  const results = await rankWeek(weekStart, weekEnd, poolUsdt);
  const payable = enabled ? results.filter((r) => r.rank in PRIZE_SPLIT && r.rewardUsdt > 0) : [];

  return db.$transaction(async (tx) => {
    for (const winner of payable) {
      await tx.ledgerEntry.create({
        data: {
          walletProfileId: winner.walletProfileId,
          balanceType: BalanceType.GAME_REWARD_USDT,
          amount: winner.rewardUsdt,
          reason: "weekly_leaderboard_payout",
          refType: "WeeklyLeaderboardPayout",
          refId: weekStart.toISOString(),
        },
      });
    }
    return tx.weeklyLeaderboardPayout.create({
      data: {
        weekStart,
        weekEnd,
        poolUsdt: enabled ? poolUsdt : 0,
        results: JSON.parse(JSON.stringify(enabled ? results : results.map((r) => ({ ...r, rewardUsdt: 0 })))),
      },
    });
  });
}

export async function getLiveStandings(weekStart: Date, weekEnd: Date) {
  const { enabled, poolUsdt } = await getWeeklyLeaderboardConfig();
  return rankWeek(weekStart, weekEnd, enabled ? poolUsdt : 0);
}
