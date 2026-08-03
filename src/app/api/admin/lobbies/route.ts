import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";
import { GAME_MODE_CONFIG } from "@/lib/game-config";

// GET /api/admin/lobbies?status=WAITING — active/recent lobby monitor.
// Not real-time-pushed (this app has no push infra, see src/lib/
// lobby.ts) — the admin UI polls this the same way it already polls
// /api/admin/overview.
export async function GET(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const status = request.nextUrl.searchParams.get("status");

  const [rows, statusCounts] = await Promise.all([
    db.gameLobby.findMany({
      where: status ? { status: status as never } : undefined,
      include: {
        host: { select: { address: true } },
        participants: { where: { status: "JOINED" } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.gameLobby.groupBy({ by: ["status"], _count: true }),
  ]);

  return NextResponse.json({
    counts: Object.fromEntries(statusCounts.map((c) => [c.status, c._count])),
    rows: rows.map((lobby) => ({
      id: lobby.id,
      roomCode: lobby.roomCode,
      status: lobby.status,
      modeLabel: GAME_MODE_CONFIG[lobby.mode].label,
      entryFeeUsdt: Number(lobby.entryFeeUsdt),
      hostAddress: lobby.host.address,
      humanCount: lobby.participants.length,
      expiresAt: lobby.expiresAt,
      startedAt: lobby.startedAt,
      finalMatchId: lobby.finalMatchId,
      createdAt: lobby.createdAt,
    })),
  });
}
