import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { joinLobbySeat, serializeLobby } from "@/lib/lobby";

// POST /api/invitations/[id]/accept
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const invitation = await db.lobbyInvitation.findUnique({ where: { id } });
  if (!invitation || invitation.recipientWalletProfileId !== session.walletProfileId) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }
  if (invitation.status !== "PENDING") {
    return NextResponse.json({ error: "This invitation is no longer pending" }, { status: 409 });
  }
  if (invitation.expiresAt.getTime() < Date.now()) {
    await db.lobbyInvitation.update({ where: { id }, data: { status: "EXPIRED" } });
    return NextResponse.json({ error: "This invitation has expired" }, { status: 410 });
  }

  const walletProfile = await db.walletProfile.findUnique({ where: { id: session.walletProfileId } });
  if (!walletProfile) return NextResponse.json({ error: "Wallet profile not found" }, { status: 404 });

  const result = await joinLobbySeat(invitation.lobbyId, walletProfile, "DIRECT_INVITE");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  await db.lobbyInvitation.update({ where: { id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });

  return NextResponse.json(await serializeLobby(invitation.lobbyId, walletProfile.id));
}
