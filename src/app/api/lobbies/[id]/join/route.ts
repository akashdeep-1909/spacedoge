import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { joinLobbySeat, serializeLobby } from "@/lib/lobby";

// POST /api/lobbies/[id]/join — accept by lobby id, requiring the
// caller already hold a PENDING direct invitation to this lobby (the
// address-based invite flow — this milestone has no public "looking to
// play" directory to join a stranger's room from, see plan). Equivalent
// to POST /api/invitations/[id]/accept, addressed the other way round;
// both share the same joinLobbySeat() core so the "only one can claim
// the last seat" concurrency guarantee lives in exactly one place.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id: lobbyId } = await params;
  const walletProfile = await db.walletProfile.findUnique({ where: { id: session.walletProfileId } });
  if (!walletProfile) return NextResponse.json({ error: "Wallet profile not found" }, { status: 404 });

  const invitation = await db.lobbyInvitation.findFirst({
    where: { lobbyId, recipientWalletProfileId: walletProfile.id, status: "PENDING" },
  });
  if (!invitation) {
    return NextResponse.json({ error: "You don't have a pending invitation to this lobby" }, { status: 403 });
  }
  if (invitation.expiresAt.getTime() < Date.now()) {
    await db.lobbyInvitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
    return NextResponse.json({ error: "This invitation has expired" }, { status: 410 });
  }

  const result = await joinLobbySeat(lobbyId, walletProfile, "DIRECT_INVITE");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  await db.lobbyInvitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });

  return NextResponse.json(await serializeLobby(lobbyId, walletProfile.id));
}
