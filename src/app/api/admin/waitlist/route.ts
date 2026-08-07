import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";

// GET /api/admin/waitlist?q=someone@ — every "Join Waitlist" popup
// submission (src/components/WaitlistModal.tsx), most recent first.
// Same "500 rows, paginate client-side" convention as
// /api/admin/users for this app's current pre-launch scale.
export async function GET(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase();
  const where = q ? { email: { contains: q } } : {};

  const [rows, totalCount] = await Promise.all([
    db.waitlistEntry.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 }),
    db.waitlistEntry.count({ where }),
  ]);

  return NextResponse.json({
    rows: rows.map((r) => ({ id: r.id, email: r.email, source: r.source, createdAt: r.createdAt })),
    totalCount,
  });
}
