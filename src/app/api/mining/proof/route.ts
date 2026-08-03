import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import {
  levelForHashrate,
  hasActivatedDashboard,
  settleYesterdayIfNeeded,
  reconcileExpiredContracts,
  getWalletAllocation,
  getWalletContractAllocations,
  estimateTodayDoge,
  getWalletMiningRoiSummary,
} from "@/lib/mining";
import { seededRandom } from "@/lib/game-config";

// GET /api/mining/proof
// ⚠️ Backs the "public mining proof" strip (doc section 10.2) with
// SIMULATED data — see the doc-comment on settleEpochForDate() in
// src/lib/mining.ts. Every field here is shaped exactly like what a
// real Pool API Connector / Public Proof Service (doc section 10.1)
// would need to serve, so swapping in a real provider later is a
// data-source change, not a UI rewrite.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // A wallet commonly holds MORE THAN ONE active contract (repeated
  // hashrate purchases stack rather than replace) — this must
  // aggregate all of them, not just the most recent one, or it
  // silently undercounts total hashrate and misreports the tier the
  // same way db.miningContract.findFirst() used to.
  const contracts = await db.miningContract.findMany({
    where: { walletProfileId: session.walletProfileId, active: true, expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: "asc" },
  });
  const hasContract = contracts.length > 0;
  const totalMhs = contracts.reduce((sum, c) => sum + Number(c.miningPower), 0);
  // Earliest expiry first — the soonest hashrate reduction a renewal
  // notice should warn about, not the longest-dated contract in the stack.
  const nextExpiresAt = contracts[0]?.expiresAt;
  const activated = await hasActivatedDashboard(session.walletProfileId);

  // Doc 9.1/9.3: "Estimated Today" (live, unsettled) and "Yesterday
  // Settled" (real ledger credit) are two SEPARATE figures, never
  // blended — settling yesterday (idempotent, cheap once already
  // done) is what actually credits AVAILABLE_DOGE; today's number
  // below is a read-only preview that never touches the ledger.
  const yesterdayEpoch = await settleYesterdayIfNeeded();
  // Day-180 close-out (doc: "Final contract reconciliation") — same
  // lazy-trigger convention as settleYesterdayIfNeeded, runs on every
  // request to this route, cheap no-op once a contract's already
  // reconciled.
  await reconcileExpiredContracts();
  const [allocation, contractAllocations, todayDogeEstimate, roiSummary] = await Promise.all([
    getWalletAllocation(session.walletProfileId, yesterdayEpoch.id),
    // This wallet's OWN per-contract breakdown for yesterday — summed
    // below into wallet-level gross/fees/electricity figures, so the
    // dashboard can show "your gross output minus your fees minus your
    // electricity" instead of the platform-wide epoch totals. A wallet
    // commonly holds several contracts (see the `contracts` fetch
    // above), so this is a sum across all of them, not one row.
    getWalletContractAllocations(session.walletProfileId, yesterdayEpoch.id),
    estimateTodayDoge(session.walletProfileId),
    getWalletMiningRoiSummary(session.walletProfileId),
  ]);

  // Sum this wallet's own contract-level USDT shares, then convert to
  // DOGE using the SAME rate every row in this epoch was actually
  // credited at (dogeUsdtRate is fixed per-epoch, not per-contract) —
  // never re-fetching a fresh/different rate here, which would silently
  // drift from what was actually credited.
  const myGrossUsdt = contractAllocations.reduce((sum, a) => sum + Number(a.grossShareUsdt), 0);
  const myElectricityUsdt = contractAllocations.reduce((sum, a) => sum + Number(a.electricityShareUsdt), 0);
  const myPoolFeeUsdt = contractAllocations.reduce((sum, a) => sum + Number(a.poolFeeShareUsdt), 0);
  const myReserveDrawUsdt = contractAllocations.reduce((sum, a) => sum + Number(a.reserveDrawUsdt), 0);
  const myEpochRate = contractAllocations[0] ? Number(contractAllocations[0].dogeUsdtRate) : null;
  const toDoge = (usdt: number) => (myEpochRate ? usdt / myEpochRate : 0);

  // Doc section 10.2's per-wallet proof strip needs THIS wallet's own
  // contracted hashrate, not the network-wide epoch total. Bug fixed:
  // this used to return epoch.contractedHashrate/observedHashrate
  // directly, which is the platform-wide aggregate (correct for the
  // public landing-page preview, wrong here) — every wallet was seeing
  // identical numbers regardless of their own Mining Power. Seeding
  // `rand` per-wallet (not just per-epoch) fixes that.
  const myHashrateGhs = hasContract ? Math.max(0.001, totalMhs / 1000) : 0;
  const rand = seededRandom(`proof:${yesterdayEpoch.id}:${session.walletProfileId}`);

  return NextResponse.json({
    activated,
    hasContract,
    level: hasContract ? levelForHashrate(totalMhs) : undefined,
    miningPower: hasContract ? totalMhs : undefined,
    expiresAt: nextExpiresAt,
    contractedHashrateGhs: myHashrateGhs,
    observedHashrate24hGhs: myHashrateGhs * (0.9 + rand() * 0.12),
    observedHashrate7dGhs: myHashrateGhs * (0.87 + rand() * 0.17),
    acceptedShares: hasContract ? Math.round(50_000 + rand() * 25_000) : 0,
    rejectedSharePct: hasContract ? Math.round(rand() * 150) / 100 : 0, // 0.00–1.50%
    uptime24hPct: hasContract ? Math.round((97 + rand() * 2.9) * 100) / 100 : 0,
    uptime7dPct: hasContract ? Math.round((96 + rand() * 3.5) * 100) / 100 : 0,
    estimatedTodayDoge: todayDogeEstimate.soFarDoge,
    projectedFullDayDoge: todayDogeEstimate.projectedFullDayDoge,
    lastEpoch: {
      epochDate: yesterdayEpoch.epochDate,
      grossOutputDoge: Number(yesterdayEpoch.grossOutputDoge),
      poolProviderFeesDoge: Number(yesterdayEpoch.poolProviderFeesDoge),
      maintenanceCostDoge: Number(yesterdayEpoch.maintenanceCostDoge),
      reserveContributionDoge: Number(yesterdayEpoch.reserveContributionDoge),
      netDistributableDoge: Number(yesterdayEpoch.netDistributableDoge),
      totalEffectiveMp: Number(yesterdayEpoch.totalEffectiveMp),
      yourAllocationDoge: allocation ? Number(allocation.dogeAllocated) : null,
      // This wallet's OWN breakdown (summed across all its contracts),
      // not the platform-wide epoch totals above — lets the dashboard
      // show "your gross output − your fees − your electricity (±
      // reserve adjustment) = your settled allocation" instead of
      // mixing platform-wide figures with one wallet's final result.
      yourGrossOutputDoge: toDoge(myGrossUsdt),
      yourPoolFeesDoge: toDoge(myPoolFeeUsdt),
      yourElectricityDoge: toDoge(myElectricityUsdt),
      yourReserveDrawDoge: toDoge(myReserveDrawUsdt),
    },
    roiSummary,
    isSimulated: true,
  });
}
