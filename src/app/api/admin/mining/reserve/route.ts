import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { getMiningProtectionReserveBalanceUsdt } from "@/lib/mining-settings";

// GET /api/admin/mining/reserve — current Protection Reserve balance
// (src/lib/mining-settings.ts's getMiningProtectionReserveBalanceUsdt,
// summed from the treasury wallet's own MINING_PROTECTION_RESERVE_USDT
// ledger rows).
export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const balanceUsdt = await getMiningProtectionReserveBalanceUsdt();
  return NextResponse.json({ balanceUsdt });
}
