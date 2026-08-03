import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";

// GET /api/admin/mining/contracts — every MiningContract, most recent
// first, with the owning wallet's address. Client paginates over this
// same batch (usePagination), same convention as GET /api/admin/users.
export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const contracts = await db.miningContract.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { walletProfile: { select: { address: true, nickname: true } } },
  });

  const rows = contracts.map((c) => ({
    id: c.id,
    walletAddress: c.walletProfile.address,
    walletNickname: c.walletProfile.nickname,
    level: c.level,
    miningPower: Number(c.miningPower),
    termDays: c.termDays,
    pricePaidUsdt: Number(c.pricePaidUsdt),
    targetRoiPct: Number(c.targetRoiPct),
    cumulativeCreditedUsdtEquiv: Number(c.cumulativeCreditedUsdtEquiv),
    active: c.active,
    startsAt: c.startsAt,
    expiresAt: c.expiresAt,
    reconciledAt: c.reconciledAt,
    finalShortfallUsdt: c.finalShortfallUsdt !== null ? Number(c.finalShortfallUsdt) : null,
    createdAt: c.createdAt,
  }));

  return NextResponse.json({ rows });
}
