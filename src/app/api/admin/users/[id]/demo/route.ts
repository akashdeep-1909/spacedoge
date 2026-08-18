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

  // Try/catch so a DB-level failure comes back as this route's own
  // {error: "..."} JSON body, not a bare framework 500 with no
  // message the client can't parse — see /api/admin/users' own
  // doc-comment on why this matters (same class of "click does
  // nothing, no error shown anywhere" bug this closes).
  try {
    await db.walletProfile.update({
      where: { id },
      data: { isDemo: parsed.data.isDemo },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to update demo flag" }, { status: 500 });
  }
}
