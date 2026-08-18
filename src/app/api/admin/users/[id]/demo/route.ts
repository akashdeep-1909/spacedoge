import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";

// isDemo is a plain admin on/off toggle on WalletProfile — see its own
// doc-comment in schema.prisma. Purely an admin-side classification;
// nothing this wallet itself or any other player can ever see changes.
const bodySchema = z.object({ isDemo: z.boolean() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid isDemo" }, { status: 400 });

  await db.walletProfile.update({
    where: { id },
    data: { isDemo: parsed.data.isDemo },
  });

  return NextResponse.json({ ok: true });
}
