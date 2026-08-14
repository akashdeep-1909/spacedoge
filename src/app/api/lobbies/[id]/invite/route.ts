import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { INVITATION_TTL_SECONDS, LOBBY_MAX_PLAYERS } from "@/lib/lobby";
import { GAME_MODE_CONFIG } from "@/lib/game-config";
import { sendPushToWallet } from "@/lib/push";

const bodySchema = z.object({ recipientAddress: z.string().min(1) });

// Ad hoc DB-query cooldown, same pattern src/app/api/matches/route.ts
// already uses for free-ticket-mode cooldowns — no rate-limit utility
// exists in this stack to reuse instead. Caps invite spam per sender.
const INVITE_RATE_LIMIT_WINDOW_MS = 60_000;
const INVITE_RATE_LIMIT_MAX = 10;

// POST /api/lobbies/[id]/invite — host or any current human occupant
// invites a wallet by address. Only creates a PENDING invitation; the
// recipient must still accept via /api/invitations/[id]/accept.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id: lobbyId } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const lobby = await db.gameLobby.findUnique({ where: { id: lobbyId }, include: { participants: true } });
  if (!lobby) return NextResponse.json({ error: "Lobby not found" }, { status: 404 });
  if (lobby.status !== "WAITING" && lobby.status !== "FULL") {
    return NextResponse.json({ error: "This lobby is no longer accepting invitations" }, { status: 409 });
  }

  const sender = lobby.participants.find((p) => p.walletProfileId === session.walletProfileId && p.status === "JOINED");
  if (!sender) return NextResponse.json({ error: "You're not in this lobby" }, { status: 403 });

  const joinedCount = lobby.participants.filter((p) => p.status === "JOINED").length;
  if (joinedCount >= LOBBY_MAX_PLAYERS) {
    return NextResponse.json({ error: "This lobby is already full" }, { status: 409 });
  }

  const address = parsed.data.recipientAddress.trim().toLowerCase();
  const recipient = await db.walletProfile.findUnique({ where: { address } });
  if (!recipient) return NextResponse.json({ error: "No player found with that wallet address" }, { status: 404 });
  if (recipient.id === session.walletProfileId) {
    return NextResponse.json({ error: "You can't invite yourself" }, { status: 400 });
  }
  if (lobby.participants.some((p) => p.walletProfileId === recipient.id && p.status === "JOINED")) {
    return NextResponse.json({ error: "That player is already in this lobby" }, { status: 409 });
  }

  const recentCount = await db.lobbyInvitation.count({
    where: { senderWalletProfileId: session.walletProfileId, createdAt: { gte: new Date(Date.now() - INVITE_RATE_LIMIT_WINDOW_MS) } },
  });
  if (recentCount >= INVITE_RATE_LIMIT_MAX) {
    return NextResponse.json({ error: "You're sending invitations too quickly, try again shortly." }, { status: 429 });
  }

  const existingPending = await db.lobbyInvitation.findFirst({
    where: { lobbyId, recipientWalletProfileId: recipient.id, status: "PENDING" },
  });
  if (existingPending) {
    return NextResponse.json({ error: "That player already has a pending invitation to this lobby" }, { status: 409 });
  }

  const invitation = await db.lobbyInvitation.create({
    data: {
      lobbyId,
      senderWalletProfileId: session.walletProfileId,
      recipientWalletProfileId: recipient.id,
      expiresAt: new Date(Date.now() + INVITATION_TTL_SECONDS * 1000),
    },
  });

  const modeLabel = GAME_MODE_CONFIG[lobby.mode].label;
  await sendPushToWallet(recipient.id, {
    title: "You're invited to play",
    body: `${session.address.slice(0, 6)}…${session.address.slice(-4)} invited you to a ${Number(lobby.entryFeeUsdt)} USDT ${modeLabel} match.`,
    url: "/dashboard/play",
  });

  return NextResponse.json({ id: invitation.id, recipientAddress: recipient.address, expiresAt: invitation.expiresAt });
}
