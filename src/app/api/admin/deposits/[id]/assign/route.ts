import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";
import { manuallyCreditDeposit } from "@/lib/deposits";

const bodySchema = z.object({ address: z.string().min(1) });

// POST /api/admin/deposits/:id/assign — manually attribute an
// UNMATCHED/PENDING deposit to a wallet by address and credit it.
// Needed because automatic matching keys on sender address; a deposit
// sent from an exchange withdrawal address (not the user's login
// wallet) will never auto-match.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid address" }, { status: 400 });

  const walletProfile = await db.walletProfile.findUnique({
    where: { address: parsed.data.address.toLowerCase() },
  });
  if (!walletProfile) return NextResponse.json({ error: "No wallet found for that address" }, { status: 404 });

  try {
    await manuallyCreditDeposit(id, walletProfile.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}
