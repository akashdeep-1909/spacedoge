import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

const bodySchema = z.object({ endpoint: z.string().url() });

// POST /api/push/unsubscribe
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  await db.pushSubscription.deleteMany({
    where: { endpoint: parsed.data.endpoint, walletProfileId: session.walletProfileId },
  });

  return NextResponse.json({ ok: true });
}
