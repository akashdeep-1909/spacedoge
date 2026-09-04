import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { approveKolVipPayout } from "@/lib/kolVip";

// POST /api/admin/kol-vip/payouts/:id/approve — the only place a KOL
// VIP bonus is actually credited (GAME_REWARD_USDT ledger entry) and
// granted (a new $0 MiningContract, if the hashrate half rounds above
// 0) — see approveKolVipPayout's own doc-comment in src/lib/kolVip.ts.
// A payout the monthly batch proposed sits PENDING until an admin
// reviews the full detail (GET /api/admin/kol-vip/payouts) and takes
// this action; nothing pays out unattended.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id } = await params;
  try {
    const updated = await approveKolVipPayout(id, session.address.toLowerCase());
    return NextResponse.json({ row: { id: updated.id, status: updated.status } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to approve" }, { status: 400 });
  }
}
