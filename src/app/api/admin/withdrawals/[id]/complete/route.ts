import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";

const bodySchema = z.object({
  txHash: z.string().min(1),
  networkFeeUsdt: z.number().nonnegative().optional(),
});

// POST /api/admin/withdrawals/:id/complete — the manual step that
// closes the loop: an admin actually sends the real on-chain USDT
// transfer from the treasury wallet (outside this app, for now — no
// treasury contract exists yet), then pastes the resulting tx hash
// here. That's what flips the withdrawal from PENDING to COMPLETED and
// makes the hash visible (as a clickable block-explorer link) on the
// user's own withdrawal detail page.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A transaction hash is required" }, { status: 400 });

  const withdrawal = await db.withdrawal.findUnique({ where: { id } });
  if (!withdrawal) return NextResponse.json({ error: "Withdrawal not found" }, { status: 404 });
  if (withdrawal.status === "COMPLETED") {
    return NextResponse.json({ error: "Already completed, a withdrawal can't be re-completed." }, { status: 409 });
  }

  const updated = await db.withdrawal.update({
    where: { id },
    data: {
      status: "COMPLETED",
      txHash: parsed.data.txHash,
      networkFeeUsdt: parsed.data.networkFeeUsdt ?? null,
      completedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, id: updated.id, status: updated.status, txHash: updated.txHash });
}
