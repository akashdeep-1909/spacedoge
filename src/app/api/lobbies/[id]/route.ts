import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { finalizeIfExpired, serializeLobby } from "@/lib/lobby";

// GET /api/lobbies/[id] — polled every 2-3s by the waiting-room UI
// (this app has no WebSocket/push infra, see src/lib/lobby.ts doc
// comment). Also the lazy-expiry check point: if the wait window has
// elapsed, this finalizes the lobby (AI-filling empty seats) before
// responding — UNLESS a Rental Bot is equipped and the room never
// reached enough real friends, in which case it's cancelled instead
// (see finalizeIfExpired's own doc-comment) — so any active poller
// self-heals a stale lobby either way, even if nobody ever clicks
// anything.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  await finalizeIfExpired(id);

  const lobby = await serializeLobby(id, session.walletProfileId);
  if (!lobby) return NextResponse.json({ error: "Lobby not found" }, { status: 404 });
  return NextResponse.json(lobby);
}
