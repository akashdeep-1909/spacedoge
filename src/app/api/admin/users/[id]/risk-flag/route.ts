import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";

// riskFlag is a free-text field on WalletProfile (see schema comment:
// "null | 'review' | 'blocked' — set only by Risk Service, never by
// users"). No automated Risk Service exists yet, so this admin action
// is that service for now — the values it writes are the same ones
// the schema already documents, not a new convention.
const bodySchema = z.object({ riskFlag: z.enum(["review", "blocked"]).nullable() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid riskFlag" }, { status: 400 });

  await db.walletProfile.update({
    where: { id },
    data: { riskFlag: parsed.data.riskFlag },
  });

  return NextResponse.json({ ok: true });
}
