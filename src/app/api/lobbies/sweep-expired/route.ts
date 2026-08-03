import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { finalizeIfExpired } from "@/lib/lobby";

// POST /api/lobbies/sweep-expired — cron-style endpoint for the case
// spec section 15C calls out explicitly: "a server-side job or queue
// must handle lobby expiry even when no browser remains open." This
// app has no background worker/queue infra (confirmed — no Redis, no
// custom server), so GET /api/lobbies/[id] already does a lazy
// finalize-if-expired check on every poll as the primary mechanism;
// this endpoint is the fallback for when literally nobody is polling.
// DEPLOYMENT NOTE: wire this to a platform scheduler in production —
// e.g. a Vercel Cron entry hitting this route every 15-30s. Not
// authenticated by session (a scheduler has no user login), so treat
// its URL as semi-secret in deployment config; it's a no-op sweep with
// no side effects beyond finalizing lobbies that are already past
// their own server-set deadline, so a stray extra call is harmless.
export async function POST() {
  const expired = await db.gameLobby.findMany({
    where: { status: "WAITING", expiresAt: { lt: new Date() } },
    select: { id: true },
    take: 100,
  });

  let finalized = 0;
  for (const { id } of expired) {
    if (await finalizeIfExpired(id)) finalized++;
  }

  return NextResponse.json({ checked: expired.length, finalized });
}
