import { db } from "@/lib/db";
import { BalanceType, GameMode, MatchStatus } from "@/generated/prisma/enums";

export interface WalletBalances {
  playUsdt: number;
  gameRewardUsdt: number;
  pts: number;
  pendingDoge: number;
  availableDoge: number;
  recycledUsdt: number;
  referralUsdt: number;
  activeMiningPower: number;
  lifetimePaidPts: number;
}

// Reconstructs every balance from the append-only ledger — doc section
// 11.3: "No administrator can directly edit a displayed balance."
// Mining Power is NOT a ledger balance (it's a non-transferable service
// entitlement, doc section 11.1), so it's summed from active contracts.
export async function getWalletBalances(walletProfileId: string): Promise<WalletBalances> {
  const [sums, activeContracts, paidScore] = await Promise.all([
    db.ledgerEntry.groupBy({
      by: ["balanceType"],
      where: { walletProfileId },
      _sum: { amount: true },
    }),
    db.miningContract.aggregate({
      where: { walletProfileId, active: true, expiresAt: { gt: new Date() } },
      _sum: { miningPower: true },
    }),
    // Lifetime PTS ever earned across every *paid* match (mode !=
    // PRACTICE — that mode is explicitly XP-only). This is raw score
    // summed straight from match history, never decreases, and is
    // separate from the spendable `pts` ledger balance below (which
    // DOES decrease as PTS gets manually converted) — shown purely as
    // a "how much have I earned in total, ever" stat.
    db.matchParticipant.aggregate({
      where: {
        walletProfileId,
        isBot: false,
        match: {
          mode: { not: GameMode.PRACTICE },
          status: { in: [MatchStatus.SETTLED_WIN, MatchStatus.SETTLED_LOSS] },
        },
      },
      _sum: { score: true },
    }),
  ]);

  const byType = Object.fromEntries(
    sums.map((row) => [row.balanceType, Number(row._sum.amount ?? 0)])
  ) as Record<BalanceType, number>;

  return {
    playUsdt: byType.PLAY_USDT ?? 0,
    gameRewardUsdt: byType.GAME_REWARD_USDT ?? 0,
    pts: byType.PTS ?? 0,
    pendingDoge: byType.PENDING_DOGE ?? 0,
    availableDoge: byType.AVAILABLE_DOGE ?? 0,
    recycledUsdt: byType.RECYCLED_USDT ?? 0,
    referralUsdt: byType.REFERRAL_USDT ?? 0,
    activeMiningPower: Number(activeContracts._sum.miningPower ?? 0),
    lifetimePaidPts: paidScore._sum.score ?? 0,
  };
}
