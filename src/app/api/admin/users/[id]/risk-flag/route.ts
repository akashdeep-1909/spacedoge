import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";
import { riskFlagBodySchema } from "@/lib/riskFlagSchema";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id } = await params;
  const parsed = riskFlagBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "riskFlag=\"blocked\" requires a non-empty note" }, { status: 400 });
  }

  const data =
    parsed.data.riskFlag === null
      ? { riskFlag: null, riskFlagNote: null, riskFlagSetAt: null }
      : {
          riskFlag: parsed.data.riskFlag,
          riskFlagNote: parsed.data.note?.length ? parsed.data.note : null,
          riskFlagSetAt: new Date(),
        };

  await db.walletProfile.update({ where: { id }, data });

  return NextResponse.json({ ok: true });
}
