import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin";
import { rejectKolVipPayout } from "@/lib/kolVip";

// POST /api/admin/kol-vip/payouts/:id/reject — declines a PENDING
// proposal outright: nothing is ever credited/granted for it, and it
// stays REJECTED permanently (see rejectKolVipPayout's own doc-comment
// in src/lib/kolVip.ts) — the KOL simply gets no VIP bonus that month.
const bodySchema = z.object({
  reason: z.string().trim().min(1),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A rejection reason is required." }, { status: 400 });

  try {
    const updated = await rejectKolVipPayout(id, session.address.toLowerCase(), parsed.data.reason);
    return NextResponse.json({ row: { id: updated.id, status: updated.status } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to reject" }, { status: 400 });
  }
}
