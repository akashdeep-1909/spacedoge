import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";
import { MiningLevel } from "@/generated/prisma/enums";

// GET /api/admin/mining-profit — same "revenue vs. distributed vs.
// platform profit" framing as /api/admin/game-profit, for mining
// packages instead of match entries: broken down by package level
// (Launch/Orbit/Lunar/Mars/Galaxy/Nova — MiningLevel, see
// src/lib/mining-shared.ts RIG_DISPLAY_NAME), the natural discrete
// "how much did the platform charge, how much has it paid back so
// far, what's left" unit here, the same role player-count played for
// matches.
//
// Per contract: revenueUsdt = MiningContract.pricePaidUsdt directly —
// deliberately NOT re-derived from the ledger the way game-profit's
// entriesUsdt is. Two reasons: (1) unlike Match's entryFeeUsdt, there
// is exactly ONE code path that ever creates a MiningContract
// (src/app/api/mining/purchase-power/route.ts), writing the row in
// the SAME transaction as the real "mining_power_purchase" ledger
// debit, so going forward this field IS trustworthy by construction;
// (2) that debit carries no refId at all (unlike Match's own entry
// debits), so there's no way to attribute a specific wallet's debit
// total back to one of their several contracts if it doesn't fully
// cover all of them — re-deriving would only trade one imprecision
// for a different, heuristic one. A small cohort of contracts
// created before "mining_power_purchase" debit-tracking existed
// (confirmed live: the earliest such debit postdates several of the
// earliest contracts) has no matching debit at all — pricePaidUsdt is
// still what's shown, since that's also exactly what every other
// mining view in this app (a wallet's own dashboard ROI card,
// admin/mining's Contracts table) already reports as this contract's
// price; disagreeing with those here would be a worse inconsistency
// than the small legacy gap itself.
// distributedUsdt = MiningContract.cumulativeCreditedUsdtEquiv
// — the USDT-equivalent VALUATION of every DOGE credit this contract
// has actually received so far (daily epoch settlement + any Day-180
// expiry top-up), incremented atomically inside the same transaction
// as each of those real ledger credits (src/lib/mining.ts
// settleEpochForDate / reconcileExpiredContracts) — already
// ledger-backed by construction, same reasoning. profitUsdt is simply
// the difference; for a still-active contract this is a running,
// not-yet-final number (it'll keep shrinking toward the contract's
// own guaranteed target as daily settlement continues).
//
// distributedDoge is the same thing in its ACTUAL native currency —
// mining only ever pays out in DOGE, never USDT directly (confirmed
// live: "mining output is only DOGE," same point already made about
// the Mining Earnings balance card elsewhere in this admin panel), so
// showing distributedUsdt alone risked implying real USDT changed
// hands here. Primary source: MiningContractAllocation.creditedDoge
// (one exact row per epoch this contract was active), which also
// carries its own creditedUsdt — this contract's cumulativeCreditedUsdtEquiv
// MINUS the sum of those creditedUsdt rows is any gap not covered by
// an allocation row (confirmed live: MiningContractAllocation as a
// table postdates when epoch settlement started crediting DOGE at
// all — the earliest allocation row is nearly two weeks after the
// earliest real credit — so a majority of contracts here have SOME
// gap). That gap is converted to an ESTIMATED DOGE amount using the
// platform-wide average historical dogeUsdtRate observed across every
// allocation row that does exist, not today's live rate — closer to
// what these older, un-tracked credits actually converted at than a
// current-day quote would be, but still an estimate, never presented
// as exact (see distributedDogeIsEstimated below).
//
// Mining referral commission (mining_referral_l1/l2) is reported
// separately, platform-wide, NOT broken out per package level or
// netted into any bucket's profitUsdt — unlike game-profit's
// referral_l1/l2 (always refType "Match", refId = one specific
// match), settleEpochForDate credits ONE aggregated DOGE amount per
// (referrer wallet, level, epoch day), summed across every contract
// that referrer's WHOLE downline ran that day — there is no per-
// contract/per-package-level attribution to cleanly re-derive without
// re-deriving each contract's own daily electricity-cost carve, the
// same genuine data-model limitation already surfaced elsewhere in
// this admin panel (src/app/api/admin/users/[id]/detail/route.ts's
// own doc-comment). Reported in DOGE (its native credited currency),
// not converted to a USDT estimate here — LedgerEntry doesn't persist
// the DOGE/USDT rate an individual entry was credited at, so a
// platform-wide USDT conversion would only ever be an approximation
// at TODAY's rate, not the real historical value.
const LEVELS: MiningLevel[] = [
  MiningLevel.SPARK,
  MiningLevel.SCOUT,
  MiningLevel.ROVER,
  MiningLevel.LUNAR,
  MiningLevel.DEEP_CORE,
  MiningLevel.ORBITAL,
];

// Excludes bot/demo wallets — bots never buy mining, but a demo wallet
// could have been credited test contracts, same REAL_USER_WALLET_FILTER
// convention as admin/overview and admin/game-profit.
const REAL_USER_WALLET_FILTER = {
  isDemo: false,
  address: { not: { startsWith: "bot:" } },
} as const;

// Generous cap, same reasoning as game-profit's own MATCH_FETCH_LIMIT —
// covers every real mining contract for the foreseeable pre-launch
// scale.
const CONTRACT_FETCH_LIMIT = 5000;

export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  try {
    const [contracts, referralAgg] = await Promise.all([
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
    ]);

    const contractIds = contracts.map((c) => c.id);
    const [allocationAgg, avgRateAgg] = await Promise.all([
      db.miningContractAllocation.groupBy({
        by: ["contractId"],
        where: { contractId: { in: contractIds } },
        _sum: { creditedDoge: true, creditedUsdt: true },
      }),
      // Platform-wide average, across every allocation row that exists
      // (any level, any contract) — the best available stand-in for
      // "what rate did the untracked legacy credits probably convert
      // at" without persisting a rate on every LedgerEntry itself.
      db.miningContractAllocation.aggregate({ _avg: { dogeUsdtRate: true } }),
    ]);
    const allocDogeByContractId = new Map(allocationAgg.map((r) => [r.contractId, Number(r._sum.creditedDoge ?? 0)]));
    const allocUsdtByContractId = new Map(allocationAgg.map((r) => [r.contractId, Number(r._sum.creditedUsdt ?? 0)]));
    const avgDogeUsdtRate = Number(avgRateAgg._avg.dogeUsdtRate ?? 0);

    const rows = contracts.map((c) => {
      const priceUsdt = Number(c.pricePaidUsdt);
      const distributedUsdt = Number(c.cumulativeCreditedUsdtEquiv);
      const allocDoge = allocDogeByContractId.get(c.id) ?? 0;
      const allocUsdt = allocUsdtByContractId.get(c.id) ?? 0;
      const gapUsdt = Math.max(0, distributedUsdt - allocUsdt);
      const gapDoge = avgDogeUsdtRate > 0 ? gapUsdt / avgDogeUsdtRate : 0;
      return {
        id: c.id,
        level: c.level,
        miningPower: Number(c.miningPower),
        termDays: c.termDays,
        priceUsdt,
        distributedUsdt,
        distributedDoge: allocDoge + gapDoge,
        // True whenever any part of this contract's DOGE total had to
        // be estimated rather than read exactly off an allocation row —
        // surfaced so the UI can mark it, not silently blended in.
        distributedDogeIsEstimated: gapUsdt > 0.000001,
        profitUsdt: priceUsdt - distributedUsdt,
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
      }
      total.contractCount += 1;
      total.revenueUsdt += r.priceUsdt;
      total.distributedUsdt += r.distributedUsdt;
      total.distributedDoge += r.distributedDoge;
      total.hasEstimatedDoge = total.hasEstimatedDoge || r.distributedDogeIsEstimated;
      total.profitUsdt += r.profitUsdt;
    }

    const referralDirectDoge = Number(referralAgg.find((r) => r.reason === "mining_referral_l1")?._sum.amount ?? 0);
    const referralIndirectDoge = Number(referralAgg.find((r) => r.reason === "mining_referral_l2")?._sum.amount ?? 0);

    return NextResponse.json({
      buckets: LEVELS.map((level) => ({ level, ...bucketsMap.get(level)! })),
      total,
      referral: { directDoge: referralDirectDoge, indirectDoge: referralIndirectDoge },
      contracts: rows,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load mining profit report" }, { status: 500 });
  }
}
