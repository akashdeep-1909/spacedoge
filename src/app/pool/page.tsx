import { db } from "@/lib/db";
import { settleYesterdayIfNeeded, estimateTodayPlatformRatePerMhsDay, currentUtcDayStart, MHS_PER_RIG } from "@/lib/mining";
import { getMiningProtectionReserveBalanceUsdt, getMiningEconomicsConfig } from "@/lib/mining-settings";
import { fetchDogeUsdtRate } from "@/lib/conversion";
import { fetchDogeNetworkStats } from "@/lib/dogeNetworkStats";
import { getLatestReserveSnapshotSummary } from "@/lib/reserve-snapshot";
import { PoolExplorer } from "@/components/pool/PoolExplorer";

// Public mining pool explorer — refreshed on a 60s ISR tick rather
// than client-side polling, matching the "This page is updated every
// 60 seconds" convention on real pool explorers this was modeled on.
export const revalidate = 60;

// The platform's own BSC treasury wallet — given directly by the
// product owner as the address to link for on-chain transparency.
// Deliberately NOT claimed to "back DOGE 1:1": it's a separate,
// same-platform trust signal alongside (not a stand-in for) the
// mining Protection Reserve balance below, which is a different
// ledger on a different chain.
const PLATFORM_TREASURY_BSC_ADDRESS = "0xdde83cf909ed4392e4099c2781c732c992b3202a";

export default async function PoolPage() {
  // Same lazy-settle-before-render convention as the public landing
  // page (src/app/page.tsx) — "yesterday" is always a real, fully
  // elapsed day by the time anyone requests this page.
  await settleYesterdayIfNeeded();

  const now = new Date();
  const [
    contractAgg,
    epochs,
    lifetimeAgg,
    reserveBalanceUsdt,
    todayRatePerMhsDay,
    economicsConfig,
    uniqueMiners,
    dogeUsdtRate,
    reserveSnapshot,
    dogeNetworkStats,
  ] = await Promise.all([
      // Same aggregation src/app/api/admin/overview/route.ts already
      // uses for "active hashrate sold" — reused here as the "ASIC Rigs
      // Under Contract" figure (expressed in rigs, not a raw contract
      // row count — see MHS_PER_RIG below).
      db.miningContract.aggregate({
        where: { active: true, expiresAt: { gt: now } },
        _sum: { miningPower: true },
        _count: true,
      }),
      db.miningEpoch.findMany({
        orderBy: { epochDate: "desc" },
        take: 50,
      }),
      db.miningEpoch.aggregate({
        where: { status: "RECONCILED" },
        _sum: { netDistributableDoge: true },
      }),
      getMiningProtectionReserveBalanceUsdt(),
      // Same "live, unsettled" estimate the mining dashboard's own Daily
      // Payout Rate chart already shows per-wallet — reused here as a
      // real (not fabricated) platform-wide rate for today's still-in-
      // progress day, DOGE per MH/s per day.
      estimateTodayPlatformRatePerMhsDay(),
      // Only poolFeePct is used from this below — the real,
      // admin-configured fee, the honest analog of the "Fee" column
      // real pool-comparison sites show. fleetCapacityMhs (admin's
      // total physical rig count, /admin/mining) is deliberately NOT
      // used for the public hashrate figure anymore — see the comment
      // on totalActiveMhs below for why.
      getMiningEconomicsConfig(),
      // Distinct wallets with an active contract right now — a real
      // "Miners" count (unique participants), not a raw contract-row
      // count (one wallet can hold several contracts).
      db.miningContract.findMany({
        where: { active: true, expiresAt: { gt: now } },
        distinct: ["walletProfileId"],
        select: { walletProfileId: true },
      }),
      // Real, external DOGE/USDT market price — the same rate feed
      // settlement itself uses (src/lib/conversion.ts), shown here
      // purely as a reference price, not something this platform
      // produces or controls.
      fetchDogeUsdtRate(),
      // Deposit proof-of-reserves Merkle root — see src/lib/reserve-
      // snapshot.ts. Builds yesterday's snapshot if it doesn't exist
      // yet, same lazy-trigger convention settleYesterdayIfNeeded()
      // above already uses.
      getLatestReserveSnapshotSummary(),
      // Real Dogecoin network difficulty/hashrate, fetched live from a
      // public blockchain data source — see dogeNetworkStats.ts's own
      // doc-comment for why this is honest (real external data) where
      // fabricating one ourselves would not have been.
      fetchDogeNetworkStats(),
    ]);

  // MiningContract.miningPower is stored in MH/s (see schema comment),
  // NOT GH/s. One rig = MHS_PER_RIG (16,000 MH/s / 16 GH/s).
  //
  // Public framing, REVISED from an earlier "show total fleet capacity
  // as what's mining" decision: that made the admin-set fleet CAPACITY
  // (mostly unsold/idle) look like the platform's real mining hashrate,
  // which produced a genuinely confusing comparison in practice — a
  // wallet holding the large majority of actual invested capital looked
  // hashrate-disproportionate against the capacity figure, when
  // rewards were never hashrate-proportional to begin with (they're
  // proportional to USDT invested with a guaranteed ROI — see
  // src/lib/mining.ts's settleEpochForDate). Showing the REAL
  // currently-contracted hashrate — what's actually under an active
  // MiningContract and genuinely earning right now — is the honest
  // "mining perspective" number a real pool would show (active
  // hashrate submitting work), not theoretical hardware capacity.
  const totalActiveMhs = Number(contractAgg._sum.miningPower ?? 0);

  // Prisma Decimal isn't serializable across the server/client
  // boundary — convert to plain numbers before handing off, same
  // pattern src/app/page.tsx already uses for its own mining stats.
  const summary = {
    totalHashrateGhs: totalActiveMhs / 1000,
    totalRigCount: Math.round(totalActiveMhs / MHS_PER_RIG),
    lifetimeDogeDistributed: Number(lifetimeAgg._sum.netDistributableDoge ?? 0),
    latestEpochDateIso: epochs[0]?.epochDate.toISOString() ?? null,
    reserveBalanceUsdt,
    poolFeePct: Number(economicsConfig.poolFeePct),
    minerCount: uniqueMiners.length,
    marketPriceUsdt: dogeUsdtRate,
    last24hRevenueDoge: Number(epochs[0]?.netDistributableDoge ?? 0),
  };

  const reserveMerkle = reserveSnapshot; // { snapshotDateIso, merkleRoot, totalWallets, totalDepositUsdt } | null

  const epochRows = epochs.map((e) => ({
    epochDateIso: e.epochDate.toISOString(),
    contractedHashrate: Number(e.contractedHashrate),
    observedHashrate: Number(e.observedHashrate),
    grossOutputDoge: Number(e.grossOutputDoge),
    netDistributableDoge: Number(e.netDistributableDoge),
    status: e.status,
  }));

  // Real inputs (today's platform-wide rate estimate x real sold
  // MH/s), prorated client-side to "so far today" — same honest
  // "prorated preview... assuming a normal day" framing
  // estimateTodayDoge already uses for a single wallet, just summed
  // across the whole fleet instead of one contract.
  const live = {
    todayEstimatedTotalDoge: todayRatePerMhsDay * totalActiveMhs,
    todayStartIso: currentUtcDayStart().toISOString(),
    serverNowIso: now.toISOString(),
  };

  return (
    <PoolExplorer
      summary={summary}
      epochs={epochRows}
      treasuryBscAddress={PLATFORM_TREASURY_BSC_ADDRESS}
      live={live}
      reserveMerkle={reserveMerkle}
      dogeNetworkStats={dogeNetworkStats}
    />
  );
}
