import { db } from "@/lib/db";

export interface PlatformStats {
  walletCount: number;
  matchCount: number;
  activeMinerCount: number;
  totalHashrateGhs: number;
  lifetimeDogeDistributed: number;
}

// Real platform-wide aggregates — the same query shape /pool
// (src/app/pool/page.tsx) and /admin's overview already use — shared by
// every public page that shows a "platform at a glance" style strip, so
// there's exactly one place computing these, not one per page.
export async function getPlatformStats(): Promise<PlatformStats> {
  const now = new Date();
  const [walletCount, matchCount, contractAgg, uniqueMiners, lifetimeAgg] = await Promise.all([
    // Excludes synthetic "bot:<mapSeed>:<i>" AI-opponent profiles and
    // the "platform:treasury" pseudo-wallet — same filter
    // src/app/api/admin/overview/route.ts uses for a real user count.
    db.walletProfile.count({
      where: { AND: [{ address: { not: { startsWith: "bot:" } } }, { address: { not: { startsWith: "platform:" } } }] },
    }),
    db.match.count(),
    db.miningContract.aggregate({
      where: { active: true, expiresAt: { gt: now } },
      _sum: { miningPower: true },
    }),
    db.miningContract.findMany({
      where: { active: true, expiresAt: { gt: now } },
      distinct: ["walletProfileId"],
      select: { walletProfileId: true },
    }),
    db.miningEpoch.aggregate({
      where: { status: "RECONCILED" },
      _sum: { netDistributableDoge: true },
    }),
  ]);

  return {
    walletCount,
    matchCount,
    activeMinerCount: uniqueMiners.length,
    totalHashrateGhs: Number(contractAgg._sum.miningPower ?? 0) / 1000,
    lifetimeDogeDistributed: Number(lifetimeAgg._sum.netDistributableDoge ?? 0),
  };
}
