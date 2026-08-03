import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { cancelLobby, serializeLobby } from "@/lib/lobby";

// POST /api/lobbies/[id]/cancel — host-only, pre-start. Releases every
// joined human's entry-fee hold back to Play USDT and marks the lobby
// CANCELLED. No platform fee or referral commission is ever created
// for a cancelled lobby (those only happen once, at finalize).
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const lobby = await db.gameLobby.findUnique({ where: { id } });
  if (!lobby) return NextResponse.json({ error: "Lobby not found" }, { status: 404 });
  if (lobby.hostWalletProfileId !== session.walletProfileId) {
    return NextResponse.json({ error: "Only the host can cancel this lobby" }, { status: 403 });
  }

  const cancelled = await cancelLobby(id);
  if (!cancelled) {
    return NextResponse.json({ error: "Lobby can no longer be cancelled" }, { status: 409 });
  }

  return NextResponse.json(await serializeLobby(id, session.walletProfileId));
}
