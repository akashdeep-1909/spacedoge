import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  currentWeekBounds,
  previousWeekBounds,
  ensureWeekFinalized,
  getLiveStandings,
} from "@/lib/leaderboard";
import { getWeeklyLeaderboardConfig, getLeaderboardEnabled } from "@/lib/settings";

// GET /api/leaderboard — doc section 22.1: "Pool and ranking disclosed
// before event." Requires a session only because it's linked from the
// dashboard nav, not because the data itself is sensitive.
//
// leaderboardEnabled (distinct from rewardsEnabled below — see the
// schema doc-comment on PlatformSettings.leaderboardEnabled) tells the
// page whether to render at all. Deliberately still computed and
// returned alongside the real data rather than short-circuiting this
// route entirely while off: ensureWeekFinalized still needs to run
// regardless (a past week's real reward payout shouldn't be skipped
// just because the page itself is currently hidden), the page is what
// decides whether to show it.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const now = new Date();
  const current = currentWeekBounds(now);
  const previous = previousWeekBounds(now);

  const [config, liveStandings, lastWeek, leaderboardEnabled] = await Promise.all([
    getWeeklyLeaderboardConfig(),
    getLiveStandings(current.weekStart, current.weekEnd),
    ensureWeekFinalized(previous.weekStart, previous.weekEnd),
    getLeaderboardEnabled(),
  ]);

  return NextResponse.json({
    leaderboardEnabled,
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
