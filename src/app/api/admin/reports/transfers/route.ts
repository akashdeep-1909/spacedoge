import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { getTransfersReport } from "@/lib/adminReports";
import { buildReportResponse } from "@/lib/adminReportRoute";

// GET /api/admin/reports/transfers?format=csv|pdf&walletId=<optional>
// walletId matches a transfer on EITHER side (sender or recipient) —
// see getTransfersReport's own OR-clause.
export async function GET(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  return buildReportResponse(request, getTransfersReport);
}
