import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";

// withdrawalRestricted is a dedicated, single-purpose block on
// withdrawal REQUESTS specifically — see its own doc-comment in
// schema.prisma for why it's separate from riskFlag. A note is
// REQUIRED when restricting (never left blank — both the admin
// looking at this wallet later, and the user themselves when their
// withdraw attempt is rejected, need an actual reason, not just "you
// can't"), and always cleared when un-restricting rather than kept
// around as stale history.
const bodySchema = z.union([
  z.object({ restricted: z.literal(true), note: z.string().trim().min(1) }),
  z.object({ restricted: z.literal(false) }),
]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "restricted=true requires a non-empty note" }, { status: 400 });
  }

  try {
    await db.walletProfile.update({
      where: { id },
      data: parsed.data.restricted
        ? { withdrawalRestricted: true, withdrawalRestrictedNote: parsed.data.note, withdrawalRestrictedAt: new Date() }
        : { withdrawalRestricted: false, withdrawalRestrictedNote: null, withdrawalRestrictedAt: null },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to update withdrawal restriction" }, { status: 500 });
  }
}
