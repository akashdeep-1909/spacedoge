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
// — the USDT-equivalent value of every DOGE credit this contract has
// actually received so far (daily epoch settlement + any Day-180
// expiry top-up), incremented atomically inside the same transaction
// as each of those real ledger credits (src/lib/mining.ts
// settleEpochForDate / reconcileExpiredContracts) — already
// ledger-backed by construction, same reasoning. profitUsdt is simply
// the difference; for a still-active contract this is a running,
// not-yet-final number (it'll keep shrinking toward the contract's
// own guaranteed target as daily settlement continues).
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

    const rows = contracts.map((c) => {
      const priceUsdt = Number(c.pricePaidUsdt);
      const distributedUsdt = Number(c.cumulativeCreditedUsdtEquiv);
      return {
        id: c.id,
        level: c.level,
        miningPower: Number(c.miningPower),
        termDays: c.termDays,
        priceUsdt,
        distributedUsdt,
        profitUsdt: priceUsdt - distributedUsdt,
        active: c.active,
        reconciled: c.reconciledAt !== null,
        finalShortfallUsdt: c.finalShortfallUsdt !== null ? Number(c.finalShortfallUsdt) : null,
        startsAt: c.startsAt.toISOString(),
        expiresAt: c.expiresAt.toISOString(),
        wallet: c.walletProfile.nickname || c.walletProfile.address,
      };
    });

    const emptyBucket = () => ({ contractCount: 0, revenueUsdt: 0, distributedUsdt: 0, profitUsdt: 0 });
    const bucketsMap = new Map<MiningLevel, ReturnType<typeof emptyBucket>>(LEVELS.map((l) => [l, emptyBucket()]));
    const total = emptyBucket();
    for (const r of rows) {
      const b = bucketsMap.get(r.level as MiningLevel);
      if (b) {
        b.contractCount += 1;
        b.revenueUsdt += r.priceUsdt;
        b.distributedUsdt += r.distributedUsdt;
        b.profitUsdt += r.profitUsdt;
      }
      total.contractCount += 1;
      total.revenueUsdt += r.priceUsdt;
      total.distributedUsdt += r.distributedUsdt;
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
