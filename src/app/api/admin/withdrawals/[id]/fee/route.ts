import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";

const bodySchema = z.object({
  networkFeeUsdt: z.number().nonnegative(),
});

// POST /api/admin/withdrawals/:id/fee — set or correct the network fee
// on a withdrawal, independent of /complete. Needed because a
// withdrawal can get marked COMPLETED without a fee recorded yet (the
// admin sent the transaction but hadn't confirmed the exact network
// cost) — this is how that gets fixed afterward, without re-running
// the (deliberately one-shot) completion step. The fee comes OUT OF
// the requested amount, not on top of it: net amount actually sent =
// amount - networkFeeUsdt (see the withdrawal detail page).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid fee amount is required" }, { status: 400 });

  const withdrawal = await db.withdrawal.findUnique({ where: { id } });
  if (!withdrawal) return NextResponse.json({ error: "Withdrawal not found" }, { status: 404 });
  if (parsed.data.networkFeeUsdt > Number(withdrawal.amount)) {
    return NextResponse.json({ error: "Fee can't exceed the withdrawal amount" }, { status: 400 });
  }

  const updated = await db.withdrawal.update({
    where: { id },
    data: { networkFeeUsdt: parsed.data.networkFeeUsdt },
  });

  return NextResponse.json({ ok: true, id: updated.id, networkFeeUsdt: Number(updated.networkFeeUsdt) });
}
