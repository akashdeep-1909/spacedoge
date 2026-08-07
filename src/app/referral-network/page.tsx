import type { Metadata } from "next";
import { db } from "@/lib/db";
import { ReferralStatus } from "@/generated/prisma/enums";
import { ReferralNetworkContent } from "@/components/ReferralNetworkContent";
import { fetchDogeUsdtRate } from "@/lib/conversion";
import { getMiningEconomicsConfig } from "@/lib/mining-settings";

export const metadata: Metadata = {
  title: "Referral Network — Space DOGE",
  description: "Invite players and earn a transparent, instantly-credited commission whenever a referred wallet enters a paid Coin Rush match or has an active mining contract.",
};

export default async function ReferralNetworkPage() {
  const [totalRelationships, qualifiedRelationships, distributedUsdtAgg, distributedDogeAgg, dogeUsdtRate, economicsConfig] = await Promise.all([
    db.referral.count(),
    db.referral.count({ where: { status: ReferralStatus.QUALIFIED } }),
    db.ledgerEntry.aggregate({
      where: { reason: { in: ["referral_l1", "referral_l2"] } },
      _sum: { amount: true },
    }),
    // Mining referral commission — same two-level relationships, but a
    // recurring DAILY carve-out of each contract's own electricity-cost
    // deduction (see creditMiningReferralDoge in src/lib/referrals.ts,
    // called from settleEpochForDate in src/lib/mining.ts), settled in
    // DOGE — a separate reason/aggregate from the USDT game-referral
    // commission above.
    db.ledgerEntry.aggregate({
      where: { reason: { in: ["mining_referral_l1", "mining_referral_l2"] } },
      _sum: { amount: true },
    }),
    fetchDogeUsdtRate(),
    getMiningEconomicsConfig(),
  ]);

  const stats = {
    totalRelationships,
    qualifiedRelationships,
    distributedUsdt: Number(distributedUsdtAgg._sum.amount ?? 0),
    distributedDoge: Number(distributedDogeAgg._sum.amount ?? 0),
  };

  // Prisma Decimal isn't serializable across the server/client boundary
  // (same convention as src/app/doge-mining/page.tsx) — convert to
  // plain numbers before handing off.
  const miningEconomics = {
    fleetCapacityMhs: Number(economicsConfig.fleetCapacityMhs),
    minerPowerKw: Number(economicsConfig.minerPowerKw),
    electricityRateUsdtPerKwh: Number(economicsConfig.electricityRateUsdtPerKwh),
  };

  return <ReferralNetworkContent stats={stats} dogeUsdtRate={dogeUsdtRate} miningEconomics={miningEconomics} />;
}
