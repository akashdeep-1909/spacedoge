import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { sendPushToWallet } from "@/lib/push";

// POST /api/invitations/[id]/decline
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

  await db.lobbyInvitation.update({ where: { id }, data: { status: "DECLINED", declinedAt: new Date() } });

  await sendPushToWallet(invitation.senderWalletProfileId, {
    title: "Invite declined",
    body: `${session.address.slice(0, 6)}…${session.address.slice(-4)} declined your invite.`,
    url: `/dashboard/play/lobby/${invitation.lobbyId}`,
  });

  return NextResponse.json({ ok: true });
}
