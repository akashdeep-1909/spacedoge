import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";
import { MiningLevel } from "@/generated/prisma/enums";
import { HASHRATE_TERM_DAYS, ECONOMICS_V2_CUTOFF_DATE } from "@/lib/mining-shared";
import { fetchDogeUsdtRate } from "@/lib/conversion";

// GET /api/admin/mining-profit — full detail view, restructured per a
// direct admin request for "more detail, not like Game [Profit]":
// activation revenue, contract revenue by package type, the platform-
// wide daily-settlement output waterfall (gross output -> pool fee ->
// electricity fee -> net distribution), referral commission, a
// forward-looking Liability/Projection for currently active contracts'
// remaining guaranteed payout, and a final Revenue-minus-Distributed-
// minus-Referral Profit rollup — plus the full per-contract table.
//
// Two different SCOPES are mixed on this one page, each labeled
// explicitly in its own section rather than silently blended:
//  - Per-contract / per-package-level figures (activation, contract
//    revenue, distributed, liability, profit) are REAL-USER-FILTERED
//    (REAL_USER_WALLET_FILTER below) — demo-flagged wallets excluded,
//    same convention as admin/overview and admin/game-profit.
//  - The Mining Output waterfall (gross/pool-fee/electricity-fee/
//    reserve/net-distribution) comes from MiningEpoch, which is a
//    PLATFORM-WIDE daily fleet rollup with no per-wallet breakdown to
//    filter by demo status at all — shown as its own clearly-labeled
//    "platform-wide" section rather than forced into the real-user
//    scope it can't actually honor.
// Only epochs from ECONOMICS_V2_CUTOFF_DATE onward are included in
// that waterfall — earlier epochs were settled under an older,
// unrelated formula (see mining-shared.ts's own doc-comment) and
// aren't comparable to the current model this report describes.
//
// Liability/Projection use TODAY's live DOGE/USDT rate (not the
// historical average used elsewhere on this page) — deliberately,
// since this is a forward-looking "what would the platform pay out
// right now if every active contract's remaining term ended today"
// figure, not a reconstruction of a past credit.
const LEVELS: MiningLevel[] = [
  MiningLevel.SPARK,
  MiningLevel.SCOUT,
  MiningLevel.ROVER,
  MiningLevel.LUNAR,
  MiningLevel.DEEP_CORE,
  MiningLevel.ORBITAL,
];

const REAL_USER_WALLET_FILTER = {
  isDemo: false,
  address: { not: { startsWith: "bot:" } },
} as const;

const CONTRACT_FETCH_LIMIT = 5000;

export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  try {
    const [contracts, referralAgg, activationAgg, epochAgg, liveRate] = await Promise.all([
      db.miningContract.findMany({
        where: { walletProfile: REAL_USER_WALLET_FILTER },
        orderBy: { createdAt: "desc" },
        take: CONTRACT_FETCH_LIMIT,
        include: { walletProfile: { select: { address: true, nickname: true } } },
      }),
      db.ledgerEntry.groupBy({
        by: ["reason"],
        where: { reason: { in: ["mining_referral_l1", "mining_referral_l2"] } },
        _sum: { amount: true },
      }),
      // Same one-time $1 "activate the mining dashboard" fee already
      // surfaced on the main Overview page (rig_activation_fee) — shown
      // here too since it's the OTHER real USDT inflow mining produces,
      // alongside package sales, and this page is meant to be the
      // complete mining revenue picture.
      db.ledgerEntry.aggregate({
        where: { reason: "rig_activation_fee", walletProfile: REAL_USER_WALLET_FILTER },
        _sum: { amount: true },
        _count: true,
      }),
      db.miningEpoch.aggregate({
        where: { epochDate: { gte: ECONOMICS_V2_CUTOFF_DATE } },
        _sum: {
          grossOutputDoge: true,
          poolProviderFeesDoge: true,
          maintenanceCostDoge: true,
          reserveContributionDoge: true,
          netDistributableDoge: true,
        },
      }),
      fetchDogeUsdtRate(),
    ]);

    const contractIds = contracts.map((c) => c.id);
    const [allocationAgg, avgRateAgg] = await Promise.all([
      db.miningContractAllocation.groupBy({
        by: ["contractId"],
        where: { contractId: { in: contractIds } },
        _sum: { creditedDoge: true, creditedUsdt: true },
      }),
      db.miningContractAllocation.aggregate({ _avg: { dogeUsdtRate: true } }),
    ]);
    const allocDogeByContractId = new Map(allocationAgg.map((r) => [r.contractId, Number(r._sum.creditedDoge ?? 0)]));
    const allocUsdtByContractId = new Map(allocationAgg.map((r) => [r.contractId, Number(r._sum.creditedUsdt ?? 0)]));
    const avgDogeUsdtRate = Number(avgRateAgg._avg.dogeUsdtRate ?? 0);

    const now = new Date();
    const rows = contracts.map((c) => {
      const priceUsdt = Number(c.pricePaidUsdt);
      const distributedUsdt = Number(c.cumulativeCreditedUsdtEquiv);
      const allocDoge = allocDogeByContractId.get(c.id) ?? 0;
      const allocUsdt = allocUsdtByContractId.get(c.id) ?? 0;
      const gapUsdt = Math.max(0, distributedUsdt - allocUsdt);
      const gapDoge = avgDogeUsdtRate > 0 ? gapUsdt / avgDogeUsdtRate : 0;
      // Remaining guaranteed payout still owed on this contract if it's
      // still active/unreconciled — the doc's own target formula
      // (pricePaidUsdt * (1+targetRoiPct)) minus whatever's already
      // been credited. Zero for a reconciled or already-shortfall-
      // closed-out contract (reconcileExpiredContracts is the one
      // event that finalizes this, see src/lib/mining.ts).
      const targetUsdt = priceUsdt * (1 + Number(c.targetRoiPct));
      const isLive = c.active && c.reconciledAt === null && c.expiresAt > now;
      const remainingLiabilityUsdt = isLive ? Math.max(0, targetUsdt - distributedUsdt) : 0;
      const profitUsdt = priceUsdt - distributedUsdt;
      return {
        id: c.id,
        level: c.level,
        miningPower: Number(c.miningPower),
        termDays: c.termDays,
        priceUsdt,
        distributedUsdt,
        distributedDoge: allocDoge + gapDoge,
        distributedDogeIsEstimated: gapUsdt > 0.000001,
        profitUsdt,
        // DOGE-equivalent of profitUsdt — see the route's own
        // doc-comment on why this uses the platform-wide historical
        // average rate (same basis distributedDoge's own estimate
        // uses), not today's live quote.
        profitDoge: avgDogeUsdtRate > 0 ? profitUsdt / avgDogeUsdtRate : 0,
        targetUsdt,
        remainingLiabilityUsdt,
        // DOGE-equivalent of remainingLiabilityUsdt — uses TODAY's live
        // rate (liveRate, fetched once above), consistent with the
        // aggregate liability figure: this is what the platform would
        // owe in DOGE if paid out right now, not a historical estimate.
        remainingLiabilityDoge: liveRate > 0 ? remainingLiabilityUsdt / liveRate : 0,
        active: c.active,
        reconciled: c.reconciledAt !== null,
        finalShortfallUsdt: c.finalShortfallUsdt !== null ? Number(c.finalShortfallUsdt) : null,
        startsAt: c.startsAt.toISOString(),
        expiresAt: c.expiresAt.toISOString(),
        wallet: c.walletProfile.nickname || c.walletProfile.address,
      };
    });

    const emptyBucket = () => ({
      contractCount: 0,
      revenueUsdt: 0,
      distributedUsdt: 0,
      distributedDoge: 0,
      hasEstimatedDoge: false,
      profitUsdt: 0,
      profitDoge: 0,
      liabilityUsdt: 0,
      liabilityDoge: 0,
      liabilityContractCount: 0,
    });
    const bucketsMap = new Map<MiningLevel, ReturnType<typeof emptyBucket>>(LEVELS.map((l) => [l, emptyBucket()]));
    const total = emptyBucket();
    for (const r of rows) {
      const b = bucketsMap.get(r.level as MiningLevel);
      if (b) {
        b.contractCount += 1;
        b.revenueUsdt += r.priceUsdt;
        b.distributedUsdt += r.distributedUsdt;
        b.distributedDoge += r.distributedDoge;
        b.hasEstimatedDoge = b.hasEstimatedDoge || r.distributedDogeIsEstimated;
        b.profitUsdt += r.profitUsdt;
        b.profitDoge += r.profitDoge;
        b.liabilityUsdt += r.remainingLiabilityUsdt;
        b.liabilityDoge += r.remainingLiabilityDoge;
        if (r.remainingLiabilityUsdt > 0) b.liabilityContractCount += 1;
      }
      total.contractCount += 1;
      total.revenueUsdt += r.priceUsdt;
      total.distributedUsdt += r.distributedUsdt;
      total.distributedDoge += r.distributedDoge;
      total.hasEstimatedDoge = total.hasEstimatedDoge || r.distributedDogeIsEstimated;
      total.profitUsdt += r.profitUsdt;
      total.profitDoge += r.profitDoge;
      total.liabilityUsdt += r.remainingLiabilityUsdt;
      total.liabilityDoge += r.remainingLiabilityDoge;
      if (r.remainingLiabilityUsdt > 0) total.liabilityContractCount += 1;
    }

    const referralDirectDoge = Number(referralAgg.find((r) => r.reason === "mining_referral_l1")?._sum.amount ?? 0);
    const referralIndirectDoge = Number(referralAgg.find((r) => r.reason === "mining_referral_l2")?._sum.amount ?? 0);
    const referralTotalDoge = referralDirectDoge + referralIndirectDoge;
    // Estimated USDT value of referral commission — same platform-wide
    // average historical rate used for the legacy DOGE gap above, for
    // the same reason (LedgerEntry doesn't persist a per-entry rate).
    const referralTotalUsdtEstimate = avgDogeUsdtRate > 0 ? referralTotalDoge * avgDogeUsdtRate : 0;

    const activationUsdt = Math.abs(Number(activationAgg._sum.amount ?? 0));
    const activationCount = activationAgg._count;

    const grossOutputDoge = Number(epochAgg._sum.grossOutputDoge ?? 0);
    const poolFeeDoge = Number(epochAgg._sum.poolProviderFeesDoge ?? 0);
    const electricityFeeDoge = Number(epochAgg._sum.maintenanceCostDoge ?? 0);
    const reserveContributionDoge = Number(epochAgg._sum.reserveContributionDoge ?? 0);
    const netDistributionDoge = Number(epochAgg._sum.netDistributableDoge ?? 0);

    // Total revenue (Activation + Contract Sales) minus what's actually
    // been distributed to users so far minus referral commission paid
    // out — the platform's real net position on real-user mining
    // activity to date. Distributed/profit here use the SAME real-
    // user-filtered, ledger-backed totals as the per-level buckets
    // above (not the platform-wide MiningEpoch waterfall, which can't
    // be scoped to real users only — see this route's own top
    // doc-comment).
    const totalRevenueUsdt = activationUsdt + total.revenueUsdt;
    const platformProfitUsdt = totalRevenueUsdt - total.distributedUsdt - referralTotalUsdtEstimate;
    // DOGE-equivalent of the final profit rollup — same historical
    // average rate basis as every other "reconstructed" DOGE figure on
    // this page (activation/contract revenue is genuinely USDT-only,
    // no DOGE component, so those two stay USDT-only above).
    const platformProfitDoge = avgDogeUsdtRate > 0 ? platformProfitUsdt / avgDogeUsdtRate : 0;

    return NextResponse.json({
      activation: { usdt: activationUsdt, count: activationCount },
      contractPeriodDays: HASHRATE_TERM_DAYS,
      buckets: LEVELS.map((level) => ({ level, ...bucketsMap.get(level)! })),
      total,
      output: {
        // Platform-wide, mining-v2-only epochs — see top doc-comment.
        grossOutputDoge,
        poolFeeDoge,
        electricityFeeDoge,
        reserveContributionDoge,
        netDistributionDoge,
        netDistributionUsdt: total.distributedUsdt, // real-user, ledger-backed — see doc-comment above
      },
      referral: {
        directDoge: referralDirectDoge,
        indirectDoge: referralIndirectDoge,
        totalDoge: referralTotalDoge,
        totalUsdtEstimate: referralTotalUsdtEstimate,
      },
      liability: {
        usdt: total.liabilityUsdt,
        doge: total.liabilityDoge,
        contractCount: total.liabilityContractCount,
        liveRateUsed: liveRate,
      },
      profit: {
        totalRevenueUsdt,
        distributedUsdt: total.distributedUsdt,
        distributedDoge: total.distributedDoge,
        referralUsdtEstimate: referralTotalUsdtEstimate,
        referralDoge: referralTotalDoge,
        profitUsdt: platformProfitUsdt,
        profitDoge: platformProfitDoge,
      },
      // Rates this response's DOGE-equivalent figures were computed
      // from — surfaced so the UI (and anyone auditing these numbers)
      // can see exactly what was used, not just trust an unlabeled
      // conversion happened.
      rates: { avgHistoricalDogeUsdt: avgDogeUsdtRate, liveDogeUsdt: liveRate },
      contracts: rows,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load mining profit report" }, { status: 500 });
  }
}
