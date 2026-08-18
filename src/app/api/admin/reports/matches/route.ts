import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { getMatchesReport } from "@/lib/adminReports";
import { buildReportResponse } from "@/lib/adminReportRoute";

// GET /api/admin/reports/matches?format=csv|pdf&walletId=<optional>
// "Game win/loss" — every real (non-bot) MatchParticipant row.
export async function GET(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  return buildReportResponse(request, getMatchesReport);
}
