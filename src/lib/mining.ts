import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { seededRandom, REFERRAL_L1_PCT, REFERRAL_L2_PCT } from "@/lib/game-config";
import { BalanceType } from "@/generated/prisma/enums";
import { EXAMPLE_NET_DOGE_PER_MHS_DAY, ACTIVATION_PRICE_USDT, DEFAULT_FLEET_CAPACITY_MHS } from "@/lib/mining-shared";
import { fetchDogeUsdtRate } from "@/lib/conversion";
import { getPlatformTreasuryWalletProfileId } from "@/lib/treasury";
import { getMiningEconomicsConfig, getMiningProtectionReserveBalanceUsdt } from "@/lib/mining-settings";
import { batchLookupMiningReferrals, creditMiningReferralDoge } from "@/lib/referrals";

export {
  ACTIVATION_PRICE_USDT,
  HASHRATE_PER_USDT,
  MIN_HASHRATE_PURCHASE_USDT,
  HASHRATE_TERM_DAYS,
  RIG_DISPLAY_NAME,
  MHS_PER_RIG,
  levelForHashrate,
} from "@/lib/mining-shared";
export { getFleetCapacityMhs } from "@/lib/mining-settings";

// Total MH/s currently sold across every active contract, platform-
// wide — the denominator for the sellable-capacity gate in
// src/app/api/mining/purchase-power/route.ts.
// Optional tx client so /api/mining/purchase-power can re-check this
// INSIDE its own locked transaction (see lockGlobalFleetCapacity's
// doc-comment in src/lib/balances.ts) — a plain read outside a lock
// let two concurrent purchases both see capacity for the same last
// slot and both sell it, overselling verified capacity.
export async function totalActiveSoldMhs(client: Prisma.TransactionClient | typeof db = db): Promise<number> {
  const sum = await client.miningContract.aggregate({
    where: { active: true, expiresAt: { gt: new Date() } },
    _sum: { miningPower: true },
  });
  return Number(sum._sum.miningPower ?? 0);
}

// Doc 6.1: "1 Game USDT activates the mining dashboard... does not
// include permanent hashrate." There's no separate "activated" column
// — a ledger entry with this reason IS the activation record, same
// "reconstruct from the ledger, never a mutable flag" pattern as
// every balance in this app.
// Optional tx client so /api/mining/activate can re-check this INSIDE
// its own locked transaction (a consistent view immediately before the
// debit, closing a double-activation TOCTOU the same class as the
// balance-check race elsewhere in the money path — see
// lockWalletForBalanceChange's doc-comment in src/lib/balances.ts).
export async function hasActivatedDashboard(
  walletProfileId: string,
  client: Prisma.TransactionClient | typeof db = db
): Promise<boolean> {
  const entry = await client.ledgerEntry.findFirst({
    where: { walletProfileId, reason: "rig_activation_fee" },
  });
  return entry !== null;
}

function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function todayUtc(): Date {
  return utcDayStart(new Date());
}

function yesterdayUtc(): Date {
  return utcDayStart(new Date(Date.now() - 24 * 60 * 60 * 1000));
}

// Seeded +/-bandPct multiplier around 1.0, deterministic per UTC day —
// e.g. bandPct=0.10 gives the same [0.9, 1.1] range the pre-v2 DOGE-
// native formula used. Shared by dailyRatePerMhsDay (legacy) and the
// mining v2 settlement math below so both draw from the same mechanic,
// just against different reference numbers.
export function dailyVarianceMultiplier(day: Date, bandPct: number): number {
  const rand = seededRandom(`rate:${utcDayStart(day).toISOString()}`);
  return 1 - bandPct + rand() * (2 * bandPct);
}

// LEGACY — the pre-v2 DOGE-native example rate, nudged +/-10% by a
// per-day seeded multiplier. Only referenced for epochs settled before
// ECONOMICS_V2_CUTOFF_DATE (see src/app/api/mining/rate-history/route.ts),
// kept byte-identical to its pre-v2 behavior so historical chart points
// never shift under it.
export function dailyRatePerMhsDay(day: Date): number {
  return EXAMPLE_NET_DOGE_PER_MHS_DAY * dailyVarianceMultiplier(day, 0.1);
}

export function currentUtcDayStart(): Date {
  return todayUtc();
}

// Platform-wide "live" (not-yet-settled) rate estimate for TODAY, in
// the same units historical rows use (net DOGE distributed / total
// effective MH/s-hours * 24) — lets the Daily Payout Rate chart's
// "live" point stay directly comparable to its "paid" (historical,
// settled) points under the mining v2 formula. Uses each active
// contract's own guaranteed target (not organic gross/electricity/
// pool-fee variance) since a normal day's real credited amount equals
// target by construction (see settleEpochForDate's doc-comment) —
// there's no separate "rate per MH/s" under mining v2, only per-
// contract targets, so this blends them into one comparable figure.
export async function estimateTodayPlatformRatePerMhsDay(): Promise<number> {
  const today = todayUtc();
  const dayEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const contracts = await db.miningContract.findMany({
    where: { startsAt: { lt: dayEnd }, expiresAt: { gt: today } },
  });
  if (contracts.length === 0) return 0;

  let teh = 0;
  let totalTargetUsdt = 0;
  for (const c of contracts) {
    const overlapStart = Math.max(c.startsAt.getTime(), today.getTime());
    const overlapEnd = Math.min(c.expiresAt.getTime(), dayEnd.getTime());
    const activeHours = Math.max(0, (overlapEnd - overlapStart) / (60 * 60 * 1000));
    if (activeHours <= 0) continue;
    teh += Number(c.miningPower) * activeHours;
    totalTargetUsdt += (Number(c.pricePaidUsdt) * (1 + Number(c.targetRoiPct))) / c.termDays;
  }
  if (teh <= 0) return 0;

  const rate = await fetchDogeUsdtRate();
  const netDoge = totalTargetUsdt / rate;
  return (netDoge / teh) * 24;
}

// The "reference" rate line on the Daily Payout Rate chart — DOGE per
// MH/s per day for the reference fleet at FULL utilization. Replaces
// the old fixed EXAMPLE_NET_DOGE_PER_MHS_DAY constant (kept only for
// legacy pre-cutoff chart continuity) now that the reference figure is
// admin-configurable (MiningEconomicsConfig.referenceMonthlyGrossUsdt /
// fleetCapacityMhs) rather than a hardcoded illustration.
export async function getReferenceDogePerMhsDay(): Promise<number> {
  const config = await getMiningEconomicsConfig();
  const fleetCapacityMhs = Number(config.fleetCapacityMhs) || DEFAULT_FLEET_CAPACITY_MHS;
  const referenceMonthlyGrossUsdt = Number(config.referenceMonthlyGrossUsdt);
  const rate = await fetchDogeUsdtRate();
  return referenceMonthlyGrossUsdt / 30 / fleetCapacityMhs / rate;
}

export interface TodayDogeEstimate {
  // Prorated by however much of today's UTC day has actually elapsed —
  // grows live throughout the day, resets at UTC midnight.
  soFarDoge: number;
  // The un-prorated full-day figure — what today's total will be if
  // every active contract hits its guaranteed target rate for the
  // whole day (the same assumption soFarDoge already makes, just not
  // scaled down to "so far"). Not a forecast that can miss high or
  // low from market/hashrate swings — the only way this differs from
  // what's actually credited tomorrow is the Protection Reserve
  // shortfall case (see settleEpochForDate), same caveat soFarDoge
  // already carries.
  projectedFullDayDoge: number;
}

// Live, UNSETTLED estimate for the current (still in progress) UTC day
// — a prorated preview of what each of the wallet's own active
// contracts would earn today at its guaranteed target rate (assuming a
// normal day; the actual credited amount can still differ if the
// Protection Reserve had to be drawn down — see settleEpochForDate).
// Deliberately touches no epoch/allocation/ledger rows, same read-only
// contract as before mining v2.
export async function estimateTodayDoge(walletProfileId: string): Promise<TodayDogeEstimate> {
  const contracts = await db.miningContract.findMany({
    where: { walletProfileId, active: true, expiresAt: { gt: new Date() } },
  });
  if (contracts.length === 0) return { soFarDoge: 0, projectedFullDayDoge: 0 };

  const today = todayUtc();
  const now = new Date();
  const fractionOfDayElapsed = (now.getTime() - today.getTime()) / (24 * 60 * 60 * 1000);

  const totalTargetUsdtToday = contracts.reduce((sum, c) => {
    const target = (Number(c.pricePaidUsdt) * (1 + Number(c.targetRoiPct))) / c.termDays;
    return sum + target;
  }, 0);

  const rate = await fetchDogeUsdtRate();
  const projectedFullDayDoge = totalTargetUsdtToday / rate;
  return { soFarDoge: projectedFullDayDoge * fractionOfDayElapsed, projectedFullDayDoge };
}

// ⚠️ SIMULATED MINING DATA — mining v2 economy model. USDT-native fleet
// economics (real electricity/pool-fee deductions, a guaranteed target
// ROI over the contract's term, backed by a Protection Reserve), only
// converted to DOGE at the moment of crediting AVAILABLE_DOGE. Still an
// internal formula-driven system, not tied to a real mining-provider/
// pool feed — the electricity rate, pool fee %, and reference gross
// figure are explicitly admin-configurable "model assumptions" (see
// MiningEconomicsConfig / src/lib/mining-settings.ts), same spirit as
// the pre-v2 model's own disclaimers.
//
// Per day, platform-wide (scaled to how much of the reference fleet
// capacity is actually sold/active that day — avgActiveMhs/fleetCapacityMhs):
//   dailyFleetGrossOutputUsdt = (avgActiveMhs/fleetCapacityMhs) * (referenceMonthlyGrossUsdt/30) * variance
//   dailyElectricityCostUsdt  = (avgActiveMhs/fleetCapacityMhs) * minerPowerKw * 24 * electricityRateUsdtPerKwh
//   dailyPoolFeeUsdt          = dailyFleetGrossOutputUsdt * poolFeePct
//
// Per contract, allocated by its share of that day's total active
// hashrate-hours (share = eh/teh, exactly the doc's own ratio formula):
//   organicNet = grossShare - electricityShare - poolFeeShare
//   target     = (pricePaidUsdt * (1+targetRoiPct)) / termDays
//   deduction  = organicNet - target
//
// The contract is credited exactly `target` every day: a positive
// deduction (organic performance came in above target) sweeps into the
// Protection Reserve; a negative one draws from it (capped by the
// reserve's actual balance — an insolvent reserve DOES let the credited
// amount dip below target, an honest edge case rather than a hidden
// one). This is what reconciles the doc's own "should fluctuate with
// pool performance" / "should not mechanically credit the same amount"
// / "reconciled at contract expiry" language: the amount is genuinely
// computed from real, varying fleet performance each day, the reserve
// is simply what's absorbing that variance so the user's guaranteed
// target is protected. Day-180 close-out (reconcileExpiredContracts,
// below) is a formal event that's a no-op whenever the reserve stayed
// solvent for that contract's whole life, and only pays a real top-up
// (or records an honest shortfall) in the case it didn't.
//
// This only ever settles a day that has fully elapsed (epochDate <
// today), and only once — re-settling an already-RECONCILED day is a
// cheap no-op, never a re-credit.
export async function settleEpochForDate(epochDate: Date) {
  const dayStart = utcDayStart(epochDate);
  if (dayStart.getTime() >= todayUtc().getTime()) {
    throw new Error("settleEpochForDate can only settle a fully-elapsed past day.");
  }

  const existing = await db.miningEpoch.findUnique({ where: { epochDate: dayStart } });
  if (existing?.status === "RECONCILED") return existing;

  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const contracts = await db.miningContract.findMany({
    where: { startsAt: { lt: dayEnd }, expiresAt: { gt: dayStart } },
  });

  const ehByContract = new Map<string, number>();
  // Same activeHours this loop already computes for `eh` — kept per
  // contract (not just folded into eh) so the target-crediting loop
  // below can prorate a contract's guaranteed daily target by it too.
  // See that loop's own doc-comment for why this matters.
  const activeHoursByContract = new Map<string, number>();
  let teh = 0;
  for (const c of contracts) {
    const overlapStart = Math.max(c.startsAt.getTime(), dayStart.getTime());
    const overlapEnd = Math.min(c.expiresAt.getTime(), dayEnd.getTime());
    const activeHours = Math.max(0, (overlapEnd - overlapStart) / (60 * 60 * 1000));
    if (activeHours <= 0) continue;
    const eh = Number(c.miningPower) * activeHours;
    ehByContract.set(c.id, eh);
    activeHoursByContract.set(c.id, activeHours);
    teh += eh;
  }

  const config = await getMiningEconomicsConfig();
  const fleetCapacityMhs = Number(config.fleetCapacityMhs) || DEFAULT_FLEET_CAPACITY_MHS;
  const avgActiveMhs = teh / 24;
  const variance = dailyVarianceMultiplier(dayStart, Number(config.dailyVarianceBandPct));

  const dailyFleetGrossOutputUsdt = (avgActiveMhs / fleetCapacityMhs) * (Number(config.referenceMonthlyGrossUsdt) / 30) * variance;
  const dailyElectricityCostUsdt = (avgActiveMhs / fleetCapacityMhs) * Number(config.minerPowerKw) * 24 * Number(config.electricityRateUsdtPerKwh);
  const dailyPoolFeeUsdt = dailyFleetGrossOutputUsdt * Number(config.poolFeePct);

  const dogeUsdtRate = await fetchDogeUsdtRate();

  // Two queries total (not one per contract) — see
  // batchLookupMiningReferrals's own doc-comment.
  const miningReferralsByWallet = await batchLookupMiningReferrals(contracts.map((c) => c.walletProfileId));

  const rand = seededRandom(`epoch:${dayStart.toISOString()}`);
  // Day-average active hashrate, in GH/s — TEH is hashrate-HOURS, so
  // dividing by 24h recovers an average instantaneous hashrate.
  const contractedHashrate = Math.max(0.001, avgActiveMhs / 1000);
  const observedHashrate = contractedHashrate * (0.9 + rand() * 0.12);

  interface ContractResult {
    contractId: string;
    walletProfileId: string;
    eh: number;
    grossShare: number;
    electricityShare: number;
    poolFeeShare: number;
    organicNet: number;
    target: number;
    deduction: number;
    reserveDraw: number;
    credited: number;
    creditedDoge: number;
  }

  const results: ContractResult[] = [];
  // Read once up front, then decremented in-memory as contracts are
  // processed in sequence within this one settlement run — prevents
  // multiple same-day shortfall-contracts from each independently
  // "seeing" the full starting balance and overdrawing it collectively.
  let reserveBalanceRemaining = teh > 0 ? await getMiningProtectionReserveBalanceUsdt() : 0;

  // Mining referral reward — recurring, daily, carved OUT of each
  // contract's own electricity-cost deduction (never paid on top): of
  // the 100% modeled electricity cost, up to 7% is redirected — 5% to
  // the wallet's direct (L1) referrer, 2% to the extended (L2) referrer
  // — instead of being subtracted as real cost. Only the levels that
  // actually exist get carved (no L1 referrer ⇒ nothing carved at all;
  // L1 but no L2 ⇒ only the 5% is carved), so this never invents an
  // "unclaimed" bucket — organicNet below uses whatever's genuinely
  // left after real payouts, same as everywhere else in this ledger.
  // Aggregated by wallet+level across every contract before crediting
  // (below, inside the transaction) since one referrer can earn from
  // several referred wallets' contracts on the same day.
  const referralDogeByWalletLevel = new Map<string, number>(); // key: `${walletId}:${level}`
  const referralQualifyIdByL1Wallet = new Map<string, string>();

  for (const c of contracts) {
    const eh = ehByContract.get(c.id);
    if (!eh || eh <= 0) continue;
    const share = eh / teh;
    const grossShare = dailyFleetGrossOutputUsdt * share;
    const electricityShare = dailyElectricityCostUsdt * share;
    const poolFeeShare = dailyPoolFeeUsdt * share;

    const referral = miningReferralsByWallet.get(c.walletProfileId);
    let netElectricityShare = electricityShare;
    if (referral) {
      const l1Usdt = electricityShare * REFERRAL_L1_PCT;
      netElectricityShare -= l1Usdt;
      const l1Key = `${referral.l1ReferrerProfileId}:1`;
      referralDogeByWalletLevel.set(l1Key, (referralDogeByWalletLevel.get(l1Key) ?? 0) + l1Usdt / dogeUsdtRate);
      referralQualifyIdByL1Wallet.set(referral.l1ReferrerProfileId, referral.l1ReferralId);

      if (referral.l2ReferrerProfileId) {
        const l2Usdt = electricityShare * REFERRAL_L2_PCT;
        netElectricityShare -= l2Usdt;
        const l2Key = `${referral.l2ReferrerProfileId}:2`;
        referralDogeByWalletLevel.set(l2Key, (referralDogeByWalletLevel.get(l2Key) ?? 0) + l2Usdt / dogeUsdtRate);
      }
    }

    const organicNet = grossShare - netElectricityShare - poolFeeShare;
    // Prorated by that day's actual active hours (÷24) — confirmed live
    // via a real settlement-data investigation (Aug 11, 2026's epoch):
    // without this, a contract purchased partway through the day still
    // earned a FULL day's target (this line used to have no ×(activeHours/24)
    // factor at all) while its organicNet share above is correctly
    // scaled down to the hours it actually mined that day, since eh/teh
    // already accounts for that. A single large, late-day purchase could
    // therefore draw a disproportionate reserve top-up on its first day
    // — e.g. a contract that only mined its last ~4.5 of 24 hours still
    // billing a full 24-hour day's guaranteed return. Harmless at the
    // reserve balances seen so far, but not correct as contract sizes
    // grow. `eh` is already activeHours-scaled (Number(c.miningPower) *
    // activeHours from the loop above), so dividing by 24 here — not by
    // termDays' own day-count — matches the same one-day window every
    // other quantity in this function (grossShare, electricityShare,
    // poolFeeShare) is already scoped to.
    const activeHours = activeHoursByContract.get(c.id) ?? 24;
    const target = ((Number(c.pricePaidUsdt) * (1 + Number(c.targetRoiPct))) / c.termDays) * (activeHours / 24);
    const deduction = organicNet - target;

    let reserveDraw = 0;
    let credited: number;
    if (deduction >= 0) {
      credited = target;
    } else {
      const shortfall = -deduction;
      reserveDraw = Math.min(shortfall, reserveBalanceRemaining);
      reserveBalanceRemaining -= reserveDraw;
      credited = organicNet + reserveDraw;
    }

    results.push({
      contractId: c.id,
      walletProfileId: c.walletProfileId,
      eh,
      grossShare,
      electricityShare: netElectricityShare,
      poolFeeShare,
      organicNet,
      target,
      deduction,
      reserveDraw,
      credited,
      creditedDoge: credited / dogeUsdtRate,
    });
  }

  const ehByWallet = new Map<string, number>();
  const dogeByWallet = new Map<string, number>();
  for (const r of results) {
    ehByWallet.set(r.walletProfileId, (ehByWallet.get(r.walletProfileId) ?? 0) + r.eh);
    dogeByWallet.set(r.walletProfileId, (dogeByWallet.get(r.walletProfileId) ?? 0) + r.creditedDoge);
  }

  const totalCreditedDoge = results.reduce((sum, r) => sum + r.creditedDoge, 0);
  const totalReserveInflowUsdt = results.reduce((sum, r) => sum + (r.deduction > 0 ? r.deduction : 0), 0);
  const totalReserveDrawUsdt = results.reduce((sum, r) => sum + r.reserveDraw, 0);
  // Signed — negative on a day the reserve had to fund more shortfall
  // than it received in surplus (see the dashboard's "Yesterday
  // Settled" panel for how a negative value is displayed).
  const netReserveContributionUsdt = totalReserveInflowUsdt - totalReserveDrawUsdt;

  const epoch = await db.miningEpoch.upsert({
    where: { epochDate: dayStart },
    create: {
      epochDate: dayStart,
      contractedHashrate,
      observedHashrate,
      grossOutputDoge: dailyFleetGrossOutputUsdt / dogeUsdtRate,
      poolProviderFeesDoge: dailyPoolFeeUsdt / dogeUsdtRate,
      // Repurposed for mining v2: this column now holds the day's real
      // metered electricity cost, not a generic "maintenance" fee.
      maintenanceCostDoge: dailyElectricityCostUsdt / dogeUsdtRate,
      reserveContributionDoge: netReserveContributionUsdt / dogeUsdtRate,
      netDistributableDoge: totalCreditedDoge,
      totalEffectiveMp: teh,
      status: "RECONCILED",
      isSimulated: true,
      publishedAt: new Date(),
    },
    update: {
      contractedHashrate,
      observedHashrate,
      grossOutputDoge: dailyFleetGrossOutputUsdt / dogeUsdtRate,
      poolProviderFeesDoge: dailyPoolFeeUsdt / dogeUsdtRate,
      maintenanceCostDoge: dailyElectricityCostUsdt / dogeUsdtRate,
      reserveContributionDoge: netReserveContributionUsdt / dogeUsdtRate,
      netDistributableDoge: totalCreditedDoge,
      totalEffectiveMp: teh,
      status: "RECONCILED",
      publishedAt: new Date(),
    },
  });

  if (results.length > 0) {
    await db.$transaction(async (tx) => {
      // Wallet-level rollup (unchanged shape) + idempotent AVAILABLE_DOGE
      // credit — same "does a ledger entry already exist for this
      // refId+wallet" guard as before mining v2.
      for (const [walletProfileId, doge] of dogeByWallet) {
        if (doge <= 0) continue;
        const eh = ehByWallet.get(walletProfileId) ?? 0;

        const allocation = await tx.miningAllocation.upsert({
          where: { epochId_walletProfileId: { epochId: epoch.id, walletProfileId } },
          create: { epochId: epoch.id, walletProfileId, effectiveMp: eh, dogeAllocated: doge },
          update: { effectiveMp: eh, dogeAllocated: doge },
        });

        // Filtered by reason too (not just refType+refId+walletProfileId)
        // — a wallet can be both a miner earning its own epoch allocation
        // AND a referrer earning mining_referral_l1/l2 from other wallets'
        // contracts on the same day, and those are separate ledger
        // entries under the same refId now, not mutually exclusive.
        const alreadyCredited = await tx.ledgerEntry.findFirst({
          where: { refType: "MiningEpoch", refId: epoch.id, walletProfileId, reason: "mining_epoch_allocation" },
        });
        if (!alreadyCredited) {
          await tx.ledgerEntry.create({
            data: {
              walletProfileId,
              balanceType: BalanceType.AVAILABLE_DOGE,
              amount: Number(allocation.dogeAllocated),
              reason: "mining_epoch_allocation",
              refType: "MiningEpoch",
              refId: epoch.id,
            },
          });
        }
      }

      // Mining referral reward — daily carve-out of each referred
      // wallet's own electricity-cost deduction (see the aggregation
      // above this transaction). One credit per (referrer wallet,
      // level) pair, already summed across every contract that
      // contributed to it today.
      for (const [key, doge] of referralDogeByWalletLevel) {
        const [walletProfileId, levelStr] = key.split(":");
        const level = Number(levelStr) as 1 | 2;
        await creditMiningReferralDoge(tx, {
          walletProfileId,
          level,
          amountDoge: doge,
          epochId: epoch.id,
          qualifyReferralId: level === 1 ? referralQualifyIdByL1Wallet.get(walletProfileId) : undefined,
        });
      }

      // Per-contract rows (idempotent via @@unique([epochId, contractId])
      // — a re-settle of an already-processed contract is a no-op) plus
      // the cumulative-credited running total each contract's own
      // Day-180 reconciliation compares against.
      for (const r of results) {
        const existingAlloc = await tx.miningContractAllocation.findUnique({
          where: { epochId_contractId: { epochId: epoch.id, contractId: r.contractId } },
        });
        if (existingAlloc) continue;

        await tx.miningContractAllocation.create({
          data: {
            epochId: epoch.id,
            contractId: r.contractId,
            walletProfileId: r.walletProfileId,
            effectiveMp: r.eh,
            grossShareUsdt: r.grossShare,
            electricityShareUsdt: r.electricityShare,
            poolFeeShareUsdt: r.poolFeeShare,
            organicNetUsdt: r.organicNet,
            targetUsdt: r.target,
            serviceVarianceDeductionUsdt: r.deduction,
            reserveDrawUsdt: r.reserveDraw,
            creditedUsdt: r.credited,
            dogeUsdtRate,
            creditedDoge: r.creditedDoge,
          },
        });
        await tx.miningContract.update({
          where: { id: r.contractId },
          data: { cumulativeCreditedUsdtEquiv: { increment: r.credited } },
        });
      }

      // Aggregate Protection Reserve ledger entries for the day —
      // guarded the same way (existence check by refId+reason) so a
      // re-settle of an already-RECONCILED epoch (impossible in
      // practice, since the early-return above already prevents it,
      // but kept for defense-in-depth symmetry with the DOGE credit
      // guard) can never double-post.
      if (totalReserveInflowUsdt > 0) {
        const already = await tx.ledgerEntry.findFirst({
          where: { refType: "MiningEpoch", refId: epoch.id, reason: "mining_reserve_variance_surplus" },
        });
        if (!already) {
          const treasuryId = await getPlatformTreasuryWalletProfileId(tx);
          await tx.ledgerEntry.create({
            data: {
              walletProfileId: treasuryId,
              balanceType: BalanceType.MINING_PROTECTION_RESERVE_USDT,
              amount: totalReserveInflowUsdt,
              reason: "mining_reserve_variance_surplus",
              refType: "MiningEpoch",
              refId: epoch.id,
            },
          });
        }
      }
      if (totalReserveDrawUsdt > 0) {
        const already = await tx.ledgerEntry.findFirst({
          where: { refType: "MiningEpoch", refId: epoch.id, reason: "mining_reserve_variance_draw" },
        });
        if (!already) {
          const treasuryId = await getPlatformTreasuryWalletProfileId(tx);
          await tx.ledgerEntry.create({
            data: {
              walletProfileId: treasuryId,
              balanceType: BalanceType.MINING_PROTECTION_RESERVE_USDT,
              amount: -totalReserveDrawUsdt,
              reason: "mining_reserve_variance_draw",
              refType: "MiningEpoch",
              refId: epoch.id,
            },
          });
        }
      }
    });
  }

  return epoch;
}

// Lazy trigger, same pattern as the old ensureTodayEpoch(): called
// from API routes on every relevant request, but now only ever
// settles YESTERDAY (a real, fully-elapsed day) instead of computing
// "today" mid-day. Cheap no-op once yesterday is already settled.
export async function settleYesterdayIfNeeded() {
  return settleEpochForDate(yesterdayUtc());
}

// Day-180 close-out (doc: "Final settlement: Day 180 reconciliation").
// A no-op for every contract whose Protection Reserve stayed solvent
// for its whole life (the daily smoothing in settleEpochForDate already
// kept it exactly on target) — only pays a real one-time top-up (or, if
// the reserve genuinely can't cover the gap, records an honest
// finalShortfallUsdt for admin visibility) in the case it didn't.
// Idempotent by construction: only ever considers contracts with
// reconciledAt still null.
export async function reconcileExpiredContracts(): Promise<void> {
  const due = await db.miningContract.findMany({
    where: { expiresAt: { lte: new Date() }, reconciledAt: null },
  });

  for (const c of due) {
    const target = Number(c.pricePaidUsdt) * (1 + Number(c.targetRoiPct));
    const credited = Number(c.cumulativeCreditedUsdtEquiv);
    const shortfall = Math.max(0, target - credited);

    await db.$transaction(async (tx) => {
      let topUpUsdt = 0;
      if (shortfall > 0) {
        const reserveBalance = await getMiningProtectionReserveBalanceUsdt(tx);
        topUpUsdt = Math.min(shortfall, reserveBalance);
        if (topUpUsdt > 0) {
          const rate = await fetchDogeUsdtRate();
          const topUpDoge = topUpUsdt / rate;
          const treasuryId = await getPlatformTreasuryWalletProfileId(tx);
          await tx.ledgerEntry.create({
            data: {
              walletProfileId: c.walletProfileId,
              balanceType: BalanceType.AVAILABLE_DOGE,
              amount: topUpDoge,
              reason: "mining_contract_expiry_topup",
              refType: "MiningContract",
              refId: c.id,
            },
          });
          await tx.ledgerEntry.create({
            data: {
              walletProfileId: treasuryId,
              balanceType: BalanceType.MINING_PROTECTION_RESERVE_USDT,
              amount: -topUpUsdt,
              reason: "mining_reserve_contract_expiry_draw",
              refType: "MiningContract",
              refId: c.id,
            },
          });
        }
      }

      const remainingShortfall = shortfall - topUpUsdt;
      await tx.miningContract.update({
        where: { id: c.id },
        data: {
          reconciledAt: new Date(),
          finalShortfallUsdt: remainingShortfall > 0 ? remainingShortfall : null,
          cumulativeCreditedUsdtEquiv: { increment: topUpUsdt },
        },
      });
    });
  }
}

// Read-only lookup — no side effects, unlike the old
// ensureAllocationForWallet() which both computed AND credited.
export async function getWalletAllocation(walletProfileId: string, epochId: string) {
  return db.miningAllocation.findUnique({
    where: { epochId_walletProfileId: { epochId, walletProfileId } },
  });
}

// Per-contract breakdown for a wallet's own allocations in one epoch —
// additive to getWalletAllocation (which stays wallet-level, unchanged)
// for anywhere a future per-contract view is wanted.
export async function getWalletContractAllocations(walletProfileId: string, epochId: string) {
  return db.miningContractAllocation.findMany({ where: { walletProfileId, epochId } });
}

export interface WalletMiningRoiSummary {
  totalPricePaidUsdt: number;
  activationFeeUsdt: number;
  totalCumulativeCreditedUsdtEquiv: number;
  packageRoiPct: number; // realized profit % so far, e.g. +10 means 10% profit over package price alone
  totalFirstCycleRoiPct: number; // realized profit %, including the one-time activation fee
  guaranteedRoiPct: number; // the locked-in promise (targetRoiPct), price-weighted across contracts — always positive, never a live/partial snapshot
  onTrackPct: number | null; // credited-so-far vs. the guaranteed daily target's own schedule, for contracts still mid-term; null when there's nothing active to measure pace against
  hasMaturedContract: boolean; // true once at least one contract has actually completed its term (reconciledAt set) — only then is packageRoiPct/totalFirstCycleRoiPct a real, finished result rather than an in-progress snapshot
}

// Doc section 8's dual ROI display — "Mining Package ROI" (package
// price only) vs. "Total First-Cycle Result" (package + activation
// fee). Aggregated across every contract the wallet has ever purchased,
// active or already-reconciled, so the number reflects the wallet's
// whole mining history, not just what's currently running.
//
// packageRoiPct/totalFirstCycleRoiPct compare cumulative credit against
// the FULL price paid up front — correct once a contract has actually
// run its full 180-day term (doc's own worked example: a $5 package
// with the $1 activation fee lands at exactly -8.33% first-cycle
// result AT MATURITY), but mechanically deep negative for nearly the
// entire term before that, since day 1 of 180 has only received 1/180
// of the guaranteed payout against a price paid in full on day 0. That
// isn't a loss — it's just early — so guaranteedRoiPct/onTrackPct give
// the UI an honest, non-alarming number to show while any contract is
// still active: the locked-in promise, and whether daily settlement is
// actually keeping pace with it.
export async function getWalletMiningRoiSummary(walletProfileId: string): Promise<WalletMiningRoiSummary> {
  const contracts = await db.miningContract.findMany({ where: { walletProfileId } });
  const totalPricePaidUsdt = contracts.reduce((sum, c) => sum + Number(c.pricePaidUsdt), 0);
  const totalCumulativeCreditedUsdtEquiv = contracts.reduce((sum, c) => sum + Number(c.cumulativeCreditedUsdtEquiv), 0);
  const activationFeeUsdt = (await hasActivatedDashboard(walletProfileId)) ? ACTIVATION_PRICE_USDT : 0;

  const packageRoiPct = totalPricePaidUsdt > 0 ? ((totalCumulativeCreditedUsdtEquiv - totalPricePaidUsdt) / totalPricePaidUsdt) * 100 : 0;
  const firstCycleBasis = totalPricePaidUsdt + activationFeeUsdt;
  const totalFirstCycleRoiPct = firstCycleBasis > 0 ? ((totalCumulativeCreditedUsdtEquiv - firstCycleBasis) / firstCycleBasis) * 100 : 0;

  const guaranteedRoiPct =
    totalPricePaidUsdt > 0
      ? (contracts.reduce((sum, c) => sum + Number(c.targetRoiPct) * Number(c.pricePaidUsdt), 0) / totalPricePaidUsdt) * 100
      : 0;

  const hasMaturedContract = contracts.some((c) => c.reconciledAt !== null);

  const now = Date.now();
  let expectedToDateUsdt = 0;
  let activeCreditedUsdt = 0;
  for (const c of contracts) {
    if (c.reconciledAt) continue; // matured contracts have a known final result — excluded from the pace estimate
    const termDays = c.termDays;
    const daysElapsed = Math.max(0, Math.min(termDays, (now - c.startsAt.getTime()) / (24 * 60 * 60 * 1000)));
    const targetPerDayUsdt = (Number(c.pricePaidUsdt) * (1 + Number(c.targetRoiPct))) / termDays;
    expectedToDateUsdt += targetPerDayUsdt * daysElapsed;
    activeCreditedUsdt += Number(c.cumulativeCreditedUsdtEquiv);
  }
  const onTrackPct = expectedToDateUsdt > 0 ? (activeCreditedUsdt / expectedToDateUsdt) * 100 : null;

  return {
    totalPricePaidUsdt,
    activationFeeUsdt,
    totalCumulativeCreditedUsdtEquiv,
    packageRoiPct,
    totalFirstCycleRoiPct,
    guaranteedRoiPct,
    onTrackPct,
    hasMaturedContract,
  };
}
