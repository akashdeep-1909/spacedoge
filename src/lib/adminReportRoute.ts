import { NextRequest, NextResponse } from "next/server";
import type { ReportTable } from "@/lib/adminReports";
import { buildCsv } from "@/lib/csvExport";
import { renderReportPdf } from "@/lib/pdfExport";

// Shared response-building for every /api/admin/reports/* export route
// (deposits, withdrawals, game results, mining contracts, transfers),
// once the caller has already confirmed admin auth — each route file
// does that itself before calling this, so this helper doesn't
// duplicate it.
//
// ?format=csv|pdf (default csv), ?walletId=<id> (omitted = every
// wallet platform-wide, for the global "Reports" page; provided = just
// that one wallet's own history, for the per-user detail page's own
// export buttons) — one route shape covers both scopes the user asked
// for ("global reports" AND "per-user, from their detail page"), no
// separate per-user endpoints needed.
export async function buildReportResponse(
  request: NextRequest,
  getReport: (walletId?: string) => Promise<ReportTable>
): Promise<NextResponse> {
  const walletId = request.nextUrl.searchParams.get("walletId") ?? undefined;
  const format = request.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "csv";
  const table = await getReport(walletId);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `${table.filenameBase}${walletId ? `-${walletId}` : ""}-${dateStamp}`;

  if (format === "pdf") {
    const buffer = await renderReportPdf(
      table,
      `${walletId ? "One wallet" : "All wallets"} · exported ${dateStamp} · ${table.rows.length} row${table.rows.length === 1 ? "" : "s"}`
    );
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      },
    });
  }

  const csv = buildCsv(table.headers, table.rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
    },
  });
}
