import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { getDepositsReport } from "@/lib/adminReports";
import { buildReportResponse } from "@/lib/adminReportRoute";

// GET /api/admin/reports/deposits?format=csv|pdf&walletId=<optional>
// See buildReportResponse's own doc-comment for the format/walletId
// contract shared by every report route.
export async function GET(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  return buildReportResponse(request, getDepositsReport);
}
