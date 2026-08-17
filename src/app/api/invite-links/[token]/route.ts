import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GAME_MODE_CONFIG } from "@/lib/game-config";
import { hashInviteToken, LOBBY_MAX_PLAYERS } from "@/lib/lobby";

// GET /api/invite-links/[token] — public, unauthenticated preview
// (spec section 14: "show the match package and mode... host...
// remaining seats... countdown" before the visitor connects a wallet).
// Deliberately returns only display-safe fields — never balances,
// internal ids beyond the lobby id needed to join, or ledger data.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const lobby = await db.gameLobby.findUnique({
    where: { inviteTokenHash: hashInviteToken(token) },
    include: { host: { select: { address: true } }, participants: { where: { status: "JOINED" } } },
  });

  if (!lobby || (lobby.status !== "WAITING" && lobby.status !== "FULL")) {
    return NextResponse.json({ error: "This invite link is no longer valid" }, { status: 410 });
  }
  if (lobby.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "This invite link has expired" }, { status: 410 });
  }

  const cfg = GAME_MODE_CONFIG[lobby.mode];
  return NextResponse.json({
    lobbyId: lobby.id,
    roomCode: lobby.roomCode,
    mode: lobby.mode,
    modeLabel: cfg.label,
    entryFeeUsdt: Number(lobby.entryFeeUsdt),
    durationSec: lobby.durationSec,
    hostAddress: lobby.host.address,
    seatsTaken: lobby.participants.length,
    maxPlayers: LOBBY_MAX_PLAYERS,
    expiresAt: lobby.expiresAt,
    serverTime: new Date(),
  });
}
