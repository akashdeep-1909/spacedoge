import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getActiveBusyState } from "@/lib/lobby";
import { getGameModeConfig } from "@/lib/gameModes";

// GET /api/matches/active — tells the client whether this wallet is
// currently blocked by checkPaidEligibility's busy-check (an open
// "Play with Friends" lobby, or a match still IN_MATCH within its
// grace window) and, if so, hands back enough detail to resume it —
// instead of the player only finding out via a 409 on their next
// attempt to start something new, with no way back in.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const busy = await getActiveBusyState(session.walletProfileId);
  if (!busy) return NextResponse.json({ type: "none" });

  if (busy.type === "lobby") {
    return NextResponse.json({ type: "lobby", lobbyId: busy.lobbyId });
  }

  const [modeCfg, players] = await Promise.all([
    getGameModeConfig(busy.mode),
    db.matchParticipant.count({ where: { matchId: busy.matchId } }),
  ]);

  return NextResponse.json({
    type: "match",
    matchId: busy.matchId,
    mapSeed: busy.mapSeed,
    mode: busy.mode,
    modeLabel: modeCfg.label,
    durationSec: busy.durationSec,
    prizePoolUsdt: busy.prizePoolUsdt,
    players,
    startedAt: busy.startedAt,
  });
}
