import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";

// isKol is a plain admin on/off toggle on WalletProfile (see schema
// comment) — a referral whose REFERRER has this set unlocks the
// KOL_REFERRAL_BONUS free-play gift for the referred wallet.
const bodySchema = z.object({ isKol: z.boolean() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid isKol" }, { status: 400 });

  await db.walletProfile.update({
    where: { id },
    data: { isKol: parsed.data.isKol },
  });

  return NextResponse.json({ ok: true });
}
