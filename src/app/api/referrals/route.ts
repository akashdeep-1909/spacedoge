import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

// GET /api/referrals — v3 economy. Returns this wallet's own referral
// link, who referred them, and every direct (L1) and indirect (L2, one
// hop up) wallet earning them a share — no qualification gate: rewards
// fire on every paid match entry (win or lose, see src/lib/referrals.ts),
// so "status" here just tracks whether any reward has ever paid through
// that edge yet.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [referredBy, direct, ledgerSums] = await Promise.all([
    db.referral.findUnique({
      where: { referredProfileId: session.walletProfileId },
      select: { status: true, referrer: { select: { address: true } } },
    }),
    db.referral.findMany({
      where: { referrerProfileId: session.walletProfileId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        createdAt: true,
        referred: { select: { id: true, address: true } },
      },
    }),
    db.ledgerEntry.groupBy({
      by: ["reason"],
      where: { walletProfileId: session.walletProfileId, reason: { in: ["referral_l1", "referral_l2"] } },
      _sum: { amount: true },
    }),
  ]);

  // Indirect (L2) wallets — one hop past each direct referral: anyone
  // *they* referred also generates 2% for this wallet.
  const directIds = direct.map((r) => r.referred.id);
  const indirect = directIds.length
    ? await db.referral.findMany({
        where: { referrerProfileId: { in: directIds } },
        select: { id: true, status: true, createdAt: true, referred: { select: { address: true } } },
      })
    : [];

  const earnedByReason = Object.fromEntries(
    ledgerSums.map((r) => [r.reason, Number(r._sum.amount ?? 0)])
  ) as Record<string, number>;

  return NextResponse.json({
    myAddress: session.address,
    referredBy: referredBy
      ? { status: referredBy.status, referrerAddress: referredBy.referrer.address }
      : null,
    l1PctOfPlatformFee: 5,
    l2PctOfPlatformFee: 2,
    totalEarnedL1Usdt: earnedByReason.referral_l1 ?? 0,
    totalEarnedL2Usdt: earnedByReason.referral_l2 ?? 0,
    direct: direct.map((r) => ({
      id: r.id,
      address: r.referred.address,
      status: r.status,
      createdAt: r.createdAt,
    })),
    indirect: indirect.map((r) => ({
      id: r.id,
      address: r.referred.address,
      status: r.status,
      createdAt: r.createdAt,
    })),
  });
}
