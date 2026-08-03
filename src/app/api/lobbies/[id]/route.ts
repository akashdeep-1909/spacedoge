import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { finalizeIfExpired, serializeLobby } from "@/lib/lobby";

// GET /api/lobbies/[id] — polled every 2-3s by the waiting-room UI
// (this app has no WebSocket/push infra, see src/lib/lobby.ts doc
// comment). Also the lazy-expiry check point: if the 60s join window
// has elapsed, this finalizes the lobby (AI-filling empty seats)
// before responding, so any active poller self-heals a stale lobby
// even if nobody ever clicks anything.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  await finalizeIfExpired(id);

  const lobby = await serializeLobby(id, session.walletProfileId);
  if (!lobby) return NextResponse.json({ error: "Lobby not found" }, { status: 404 });
  return NextResponse.json(lobby);
}
