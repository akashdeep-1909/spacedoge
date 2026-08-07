import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";

// Wraps a field in double quotes only when it actually needs it
// (contains a comma, quote, or newline), doubling any internal quotes
// — the standard minimal CSV-escaping rule (RFC 4180).
function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

// GET /api/admin/waitlist/export — full CSV dump of every waitlist
// signup, unbounded (unlike the paginated /api/admin/waitlist list
// view) since an export is explicitly asking for the whole dataset.
export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const rows = await db.waitlistEntry.findMany({ orderBy: { createdAt: "desc" } });

  const header = ["Email", "Source", "Joined At (UTC)"].join(",");
  const lines = rows.map((r) =>
    [csvField(r.email), csvField(r.source ?? ""), csvField(r.createdAt.toISOString())].join(",")
  );
  const csv = [header, ...lines].join("\n") + "\n";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="waitlist-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
