import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

const bodySchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

// POST /api/push/subscribe — saves (or refreshes) a browser's Web Push
// subscription for the caller's wallet. `endpoint` is globally unique
// per browser subscription, used as the upsert key — the same browser
// re-subscribing (e.g. after clearing permission and re-granting) just
// updates its keys rather than creating a duplicate row.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  const { endpoint, keys } = parsed.data;

  await db.pushSubscription.upsert({
    where: { endpoint },
    update: { walletProfileId: session.walletProfileId, p256dh: keys.p256dh, auth: keys.auth },
    create: { walletProfileId: session.walletProfileId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
  });

  return NextResponse.json({ ok: true });
}
