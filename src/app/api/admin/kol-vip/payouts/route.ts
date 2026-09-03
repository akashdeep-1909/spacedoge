import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";

// GET /api/admin/kol-vip/payouts — read-only audit log of every KOL VIP
// payout ever written (src/lib/kolVip.ts's ensureMonthFinalized is the
// only writer). Newest month first, capped the same way every other
// admin list in this app caps its underlying fetch.
const FETCH_LIMIT = 500;

export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const rows = await db.kolVipPayout.findMany({
    orderBy: [{ periodMonth: "desc" }, { bonusUsdt: "desc" }],
    take: FETCH_LIMIT,
    include: {
      walletProfile: { select: { address: true, nickname: true } },
      kolVipTier: { select: { label: true } },
    },
  });

  return NextResponse.json({
    rows: rows.map((r) => ({
      id: r.id,
      address: r.walletProfile.address,
      nickname: r.walletProfile.nickname,
      periodMonth: r.periodMonth,
      tierLabel: r.kolVipTier.label,
      qualifiedDirectCount: r.qualifiedDirectCount,
      qualifiedIndirectCount: r.qualifiedIndirectCount,
      downlineProfitUsdt: Number(r.downlineProfitUsdt),
      totalCommissionUsdt: Number(r.totalCommissionUsdt),
      bonusUsdt: Number(r.bonusUsdt),
      hashrateConversionUsdt: Number(r.hashrateConversionUsdt),
      bonusHashrateMhs: Number(r.bonusHashrateMhs),
      createdAt: r.createdAt,
    })),
  });
}
