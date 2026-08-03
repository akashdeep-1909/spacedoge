import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  currentWeekBounds,
  previousWeekBounds,
  ensureWeekFinalized,
  getLiveStandings,
} from "@/lib/leaderboard";
import { getWeeklyLeaderboardConfig } from "@/lib/settings";

// GET /api/leaderboard — doc section 22.1: "Pool and ranking disclosed
// before event." Requires a session only because it's linked from the
// dashboard nav, not because the data itself is sensitive.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const now = new Date();
  const current = currentWeekBounds(now);
  const previous = previousWeekBounds(now);

  const [config, liveStandings, lastWeek] = await Promise.all([
    getWeeklyLeaderboardConfig(),
    getLiveStandings(current.weekStart, current.weekEnd),
    ensureWeekFinalized(previous.weekStart, previous.weekEnd),
  ]);

  return NextResponse.json({
    poolUsdt: config.poolUsdt,
    rewardsEnabled: config.enabled,
    currentWeek: {
      weekStart: current.weekStart,
      weekEnd: current.weekEnd,
      standings: liveStandings,
    },
    lastWeek: {
      weekStart: lastWeek.weekStart,
      weekEnd: lastWeek.weekEnd,
      poolUsdt: Number(lastWeek.poolUsdt),
      results: lastWeek.results,
    },
  });
}
