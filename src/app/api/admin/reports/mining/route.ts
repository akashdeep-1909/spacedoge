import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { getMiningReport } from "@/lib/adminReports";
import { buildReportResponse } from "@/lib/adminReportRoute";

// GET /api/admin/reports/mining?format=csv|pdf&walletId=<optional>
export async function GET(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  return buildReportResponse(request, getMiningReport);
}
