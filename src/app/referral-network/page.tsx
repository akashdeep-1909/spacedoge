import type { Metadata } from "next";
import { db } from "@/lib/db";
import { ReferralStatus } from "@/generated/prisma/enums";
import { ReferralNetworkContent } from "@/components/ReferralNetworkContent";

export const metadata: Metadata = {
  title: "Referral Network — Space DOGE",
  description: "Invite players and earn a transparent, instantly-credited commission whenever a referred wallet enters a paid Coin Rush match.",
};

export default async function ReferralNetworkPage() {
  const [totalRelationships, qualifiedRelationships, distributedAgg] = await Promise.all([
    db.referral.count(),
    db.referral.count({ where: { status: ReferralStatus.QUALIFIED } }),
    db.ledgerEntry.aggregate({
      where: { reason: { in: ["referral_l1", "referral_l2"] } },
      _sum: { amount: true },
    }),
  ]);

  const stats = {
    totalRelationships,
    qualifiedRelationships,
    distributedUsdt: Number(distributedAgg._sum.amount ?? 0),
  };

  return <ReferralNetworkContent stats={stats} />;
}
