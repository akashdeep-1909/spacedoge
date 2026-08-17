import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { GAME_MODE_CONFIG } from "@/lib/game-config";

// GET /api/invitations — the caller's incoming and sent lobby
// invitations, most recent first. Polled by the "Invitations" panel
// (this app has no push infra — see src/lib/lobby.ts doc comment).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [incoming, sent] = await Promise.all([
    db.lobbyInvitation.findMany({
      where: { recipientWalletProfileId: session.walletProfileId },
      include: { sender: { select: { address: true } }, lobby: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    db.lobbyInvitation.findMany({
      where: { senderWalletProfileId: session.walletProfileId },
      include: { recipient: { select: { address: true } }, lobby: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);

  const shape = (inv: (typeof incoming)[number] | (typeof sent)[number], otherAddress: string) => {
    const cfg = GAME_MODE_CONFIG[inv.lobby.mode];
    return {
      id: inv.id,
      lobbyId: inv.lobbyId,
      roomCode: inv.lobby.roomCode,
      otherAddress,
      mode: inv.lobby.mode,
      modeLabel: cfg.label,
      entryFeeUsdt: Number(inv.lobby.entryFeeUsdt),
      status: inv.status,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
    };
  };

  return NextResponse.json({
    incoming: incoming.map((inv) => shape(inv, inv.sender.address)),
    sent: sent.map((inv) => shape(inv, inv.recipient.address)),
  });
}
