import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";
import { BalanceType, DepositStatus, WithdrawalStatus } from "@/generated/prisma/enums";
import { getMiningProtectionReserveBalanceUsdt } from "@/lib/mining-settings";

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Zero-filled day buckets for the requested range, so a day with no
// activity still renders as a real zero point on the chart instead of
// a gap.
function emptySeries(days: number) {
  const out: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(dayKey(d));
  }
  return out;
}

export async function GET(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const days = Math.min(Math.max(Number(searchParams.get("days")) || 30, 7), 90);
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (days - 1));
  since.setUTCHours(0, 0, 0, 0);

  const [
    walletCount,
    newWallets,
    ledgerSums,
    depositTotals,
    depositRowsInRange,
    depositRecent,
    withdrawalTotals,
    withdrawalFeeAgg,
    withdrawalRowsInRange,
    withdrawalRecent,
    activeContracts,
    latestEpoch,
    matchCount,
    activeLobbyCount,
    surplusAgg,
  ] = await Promise.all([
    // Excludes synthetic "bot:<mapSeed>:<i>" profiles every match spawns
    // for AI opponents, and the "platform:treasury" pseudo-wallet — not
    // real users, see admin/users/route.ts.
    db.walletProfile.count({
      where: { AND: [{ address: { not: { startsWith: "bot:" } } }, { address: { not: { startsWith: "platform:" } } }] },
    }),
    db.walletProfile.count({
      where: {
        AND: [{ address: { not: { startsWith: "bot:" } } }, { address: { not: { startsWith: "platform:" } } }],
        createdAt: { gte: since },
      },
    }),
    db.ledgerEntry.groupBy({ by: ["balanceType"], _sum: { amount: true } }),
    db.onchainDeposit.groupBy({ by: ["status"], _sum: { amount: true }, _count: true }),
    db.onchainDeposit.findMany({
      where: { createdAt: { gte: since } },
      select: { amount: true, status: true, createdAt: true },
    }),
    db.onchainDeposit.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { walletProfile: { select: { address: true } } },
    }),
    // Grouped by balanceType too, not just status — a withdrawal's
    // `amount` is either raw USDT (RECYCLED_USDT/REFERRAL_USDT/
    // GAME_REWARD_USDT source) or raw DOGE (AVAILABLE_DOGE source, the
    // DOGE chain's only valid source — see /api/wallet/withdraw's own
    // doc-comment). Summing both into one number and labeling it "$"
    // was silently adding literal DOGE token counts on top of a USDT
    // total — confirmed live: "if USDT withdrawal show USDT if DOGE
    // show DOGE."
    db.withdrawal.groupBy({ by: ["status", "balanceType"], _sum: { amount: true }, _count: true }),
    db.withdrawal.aggregate({ where: { status: "COMPLETED" }, _sum: { networkFeeUsdt: true } }),
    db.withdrawal.findMany({
      where: { createdAt: { gte: since } },
      select: { amount: true, networkFeeUsdt: true, status: true, createdAt: true, completedAt: true },
    }),
    db.withdrawal.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { walletProfile: { select: { address: true } } },
    }),
    db.miningContract.aggregate({
      where: { active: true, expiresAt: { gt: new Date() } },
      _sum: { miningPower: true },
      _count: true,
    }),
    db.miningEpoch.findFirst({ orderBy: { epochDate: "desc" } }),
    db.match.count(),
    // "Play with Friends" lobbies still accepting/finalizing joins —
    // see src/lib/lobby.ts. Full detail lives at /admin/lobbies.
    db.gameLobby.count({ where: { status: { in: ["WAITING", "FULL", "FILLING_AI", "STARTING"] } } }),
    // Spec section 23: leftover prize pool (paid out < that match's
    // prizePoolUsdt) credited to treasury under its own reason code,
    // by src/app/api/matches/[id]/results.
    db.ledgerEntry.aggregate({ where: { reason: "match_unused_prize_surplus" }, _sum: { amount: true } }),
  ]);

  const balances = Object.fromEntries(
    ledgerSums.map((r) => [r.balanceType, Number(r._sum.amount ?? 0)])
  ) as Record<BalanceType, number>;

  const miningReserveBalanceUsdt = await getMiningProtectionReserveBalanceUsdt();

  const depositByStatus = Object.fromEntries(
    depositTotals.map((r) => [r.status, { count: r._count, amount: Number(r._sum.amount ?? 0) }])
  ) as Record<DepositStatus, { count: number; amount: number }>;

  // Two currency buckets per status, not one — see the groupBy's own
  // doc-comment above. AVAILABLE_DOGE is the DOGE chain's only source;
  // everything else withdrawable (RECYCLED_USDT/REFERRAL_USDT/
  // GAME_REWARD_USDT) is USDT.
  const emptyCurrencyBucket = () => ({ usdt: { count: 0, amount: 0 }, doge: { count: 0, amount: 0 } });
  const withdrawalByStatus: Record<WithdrawalStatus, { usdt: { count: number; amount: number }; doge: { count: number; amount: number } }> = {
    PENDING: emptyCurrencyBucket(),
    COMPLETED: emptyCurrencyBucket(),
  };
  for (const row of withdrawalTotals) {
    const bucket = withdrawalByStatus[row.status];
    if (!bucket) continue;
    const target = row.balanceType === BalanceType.AVAILABLE_DOGE ? bucket.doge : bucket.usdt;
    target.count += row._count;
    target.amount += Number(row._sum.amount ?? 0);
  }

  const depositBuckets = new Map<string, { unmatched: number; pending: number; credited: number }>();
  for (const day of emptySeries(days)) depositBuckets.set(day, { unmatched: 0, pending: 0, credited: 0 });
  for (const d of depositRowsInRange) {
    const bucket = depositBuckets.get(dayKey(d.createdAt));
    if (!bucket) continue;
    const amt = Number(d.amount);
    if (d.status === "UNMATCHED") bucket.unmatched += amt;
    else if (d.status === "PENDING") bucket.pending += amt;
    else bucket.credited += amt;
  }
  const depositSeries = Array.from(depositBuckets.entries()).map(([date, v]) => ({ date, ...v }));

  const withdrawalBuckets = new Map<string, { requested: number; completed: number }>();
  for (const day of emptySeries(days)) withdrawalBuckets.set(day, { requested: 0, completed: 0 });
  for (const w of withdrawalRowsInRange) {
    const reqBucket = withdrawalBuckets.get(dayKey(w.createdAt));
    if (reqBucket) reqBucket.requested += Number(w.amount);
    if (w.status === "COMPLETED" && w.completedAt) {
      const compBucket = withdrawalBuckets.get(dayKey(w.completedAt));
      if (compBucket) compBucket.completed += Number(w.amount);
    }
  }
  const withdrawalSeries = Array.from(withdrawalBuckets.entries()).map(([date, v]) => ({ date, ...v }));

  return NextResponse.json({
    range: days,
    walletCount,
    newWallets,
    matchCount,
    activeLobbyCount,
    matchUnusedPrizeSurplusUsdt: Number(surplusAgg._sum.amount ?? 0),
    balances: {
      playUsdt: balances.PLAY_USDT ?? 0,
      gameRewardUsdt: balances.GAME_REWARD_USDT ?? 0,
      pts: balances.PTS ?? 0,
      pendingDoge: balances.PENDING_DOGE ?? 0,
      availableDoge: balances.AVAILABLE_DOGE ?? 0,
      recycledUsdt: balances.RECYCLED_USDT ?? 0,
      referralUsdt: balances.REFERRAL_USDT ?? 0,
      // The platform treasury's real, ledger-tracked balance (net of
      // referral commission already paid out) — src/lib/treasury.ts.
      // Only the "platform:treasury" pseudo-wallet ever receives this
      // balance type, so the raw ledger sum across all wallets is
      // already exactly the treasury's own total.
      treasuryUsdt: balances.PLATFORM_FEE_USDT ?? 0,
    },
    // The platform's user-withdrawable USDT liability — sum of the
    // exact three balance types /api/wallet/withdraw currently accepts
    // as a source. Play USDT is the one exception, it funds game
    // entries/mining spend only and is never withdrawable; PTS/DOGE
    // balances aren't directly cash-out-able either — keep this in
    // sync with that route's own z.enum.
    availableUsdt: (balances.RECYCLED_USDT ?? 0) + (balances.REFERRAL_USDT ?? 0) + (balances.GAME_REWARD_USDT ?? 0),
    deposits: {
      totals: {
        unmatched: depositByStatus.UNMATCHED ?? { count: 0, amount: 0 },
        pending: depositByStatus.PENDING ?? { count: 0, amount: 0 },
        credited: depositByStatus.CREDITED ?? { count: 0, amount: 0 },
      },
      series: depositSeries,
      recent: depositRecent.map((d) => ({
        id: d.id,
        chain: d.chain,
        amount: Number(d.amount),
        status: d.status,
        fromAddress: d.fromAddress,
        walletAddress: d.walletProfile?.address ?? null,
        createdAt: d.createdAt,
      })),
    },
    withdrawals: {
      totals: {
        pending: withdrawalByStatus.PENDING,
        completed: withdrawalByStatus.COMPLETED,
      },
      // Always genuinely USDT regardless of which coin a given
      // withdrawal moved — the admin records this on completion as the
      // real broadcast tx's cost, in USDT-equivalent terms, even for a
      // DOGE withdrawal (schema: "networkFeeUsdt... real cost of the
      // broadcast tx"). No currency split needed here, unlike the
      // totals above.
      feesCollected: Number(withdrawalFeeAgg._sum.networkFeeUsdt ?? 0),
      series: withdrawalSeries,
      recent: withdrawalRecent.map((w) => ({
        id: w.id,
        amount: Number(w.amount),
        balanceType: w.balanceType,
        networkFeeUsdt: w.networkFeeUsdt !== null ? Number(w.networkFeeUsdt) : null,
        status: w.status,
        address: w.walletProfile.address,
        createdAt: w.createdAt,
        completedAt: w.completedAt,
      })),
    },
    mining: {
      activeMiningPower: Number(activeContracts._sum.miningPower ?? 0),
      activeContracts: activeContracts._count,
      reserveBalanceUsdt: miningReserveBalanceUsdt,
      latestEpoch: latestEpoch
        ? {
            epochDate: latestEpoch.epochDate,
            netDistributableDoge: Number(latestEpoch.netDistributableDoge),
            totalEffectiveMp: Number(latestEpoch.totalEffectiveMp),
            isSimulated: latestEpoch.isSimulated,
          }
        : null,
    },
  });
}
