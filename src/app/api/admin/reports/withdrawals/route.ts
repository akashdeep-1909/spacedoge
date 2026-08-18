import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { getWithdrawalsReport } from "@/lib/adminReports";
import { buildReportResponse } from "@/lib/adminReportRoute";

// GET /api/admin/reports/withdrawals?format=csv|pdf&walletId=<optional>
export async function GET(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  return buildReportResponse(request, getWithdrawalsReport);
}
