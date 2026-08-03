import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { hashInviteToken, joinLobbySeat, serializeLobby } from "@/lib/lobby";

// POST /api/invite-links/[token]/join — authenticated join via a
// shared link (as opposed to a direct wallet-address invitation).
// Reuses the same joinLobbySeat() concurrency-safe core as every other
// accept path.
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { token } = await params;
  const lobby = await db.gameLobby.findUnique({ where: { inviteTokenHash: hashInviteToken(token) } });
  if (!lobby) return NextResponse.json({ error: "This invite link is no longer valid" }, { status: 410 });

  const walletProfile = await db.walletProfile.findUnique({ where: { id: session.walletProfileId } });
  if (!walletProfile) return NextResponse.json({ error: "Wallet profile not found" }, { status: 404 });

  const result = await joinLobbySeat(lobby.id, walletProfile, "INVITE_LINK");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(await serializeLobby(lobby.id, walletProfile.id));
}
