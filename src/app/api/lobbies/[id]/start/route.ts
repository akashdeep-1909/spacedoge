import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { finalizeLobby, serializeLobby } from "@/lib/lobby";

// POST /api/lobbies/[id]/start — host-only "Start Game with AI Racers"
// early-start button. Fills every empty seat with a deterministic bot
// and finalizes the room economy exactly once, same finalizeLobby()
// path the 60s auto-expiry and the all-4-humans-joined auto-start use.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const lobby = await db.gameLobby.findUnique({ where: { id } });
  if (!lobby) return NextResponse.json({ error: "Lobby not found" }, { status: 404 });
  if (lobby.hostWalletProfileId !== session.walletProfileId) {
    return NextResponse.json({ error: "Only the host can start this lobby" }, { status: 403 });
  }
  if (lobby.status !== "WAITING" && lobby.status !== "FULL") {
    return NextResponse.json({ error: "Lobby can no longer be started" }, { status: 409 });
  }

  await db.gameLobby.updateMany({
    where: { id, status: lobby.status, version: lobby.version },
    data: { status: "FILLING_AI", version: { increment: 1 } },
  });

  const result = await finalizeLobby(id);
  if (!result) {
    return NextResponse.json({ error: "Lobby could not be started — try again" }, { status: 409 });
  }

  return NextResponse.json(await serializeLobby(id, session.walletProfileId));
}
