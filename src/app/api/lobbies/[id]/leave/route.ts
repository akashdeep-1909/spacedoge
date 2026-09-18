import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { leaveLobbySeat, serializeLobby } from "@/lib/lobby";

// POST /api/lobbies/[id]/leave — any non-host JOINED participant can
// back out of a lobby before it starts (see leaveLobbySeat's own
// doc-comment in src/lib/lobby.ts). Unlike .../cancel, this never
// touches anyone else's seat or the lobby's own status beyond FULL ->
// WAITING once a seat opens up.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const result = await leaveLobbySeat(id, session.walletProfileId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Failed to leave lobby" }, { status: 409 });
  }

  return NextResponse.json(await serializeLobby(id, session.walletProfileId));
}
