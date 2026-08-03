import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { RATE_FORMULA_CUTOFF_DATE } from "@/lib/mining-shared";
import { estimateTodayPlatformRatePerMhsDay, getReferenceDogePerMhsDay, currentUtcDayStart } from "@/lib/mining";

const NUM_DAYS = 7;

// GET /api/mining/rate-history — platform-wide (not per-wallet): a
// fixed 7-day window (the 6 most recent fully-elapsed days, plus today
// as a live point) of the real DOGE-per-MH/s-per-day rate, next to the
// admin-configurable reference rate (mining v2 — was a fixed hardcoded
// example pre-v2, see getReferenceDogePerMhsDay's doc-comment).
//
// Always returns exactly NUM_DAYS-1 past-day rows (zero-filled to
// `null`, not omitted, for any day with no settled epoch yet — e.g.
// before RATE_FORMULA_CUTOFF_DATE) plus today's LIVE rate (not yet
// settled, same formula/seed real settlement will use once today
// actually settles tomorrow) — so the chart always shows a full week
// of x-axis space instead of shrinking to however many real data
// points happen to exist.
//
// Days before RATE_FORMULA_CUTOFF_DATE are always left blank even if
// an (old-formula) epoch exists for them — that epoch used a different
// shared-pool formula and isn't comparable to the current rate.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const today = currentUtcDayStart();
  const pastDays: Date[] = [];
  for (let i = NUM_DAYS - 1; i >= 1; i--) {
    pastDays.push(new Date(today.getTime() - i * 24 * 60 * 60 * 1000));
  }
  const rangeStart = pastDays[0];

  const epochs = await db.miningEpoch.findMany({
    where: {
      status: "RECONCILED",
      epochDate: { gte: rangeStart > RATE_FORMULA_CUTOFF_DATE ? rangeStart : RATE_FORMULA_CUTOFF_DATE, lt: today },
    },
  });
  const byDate = new Map(epochs.map((e) => [e.epochDate.getTime(), e]));

  const rows = pastDays.map((day) => {
    const epoch = day.getTime() >= RATE_FORMULA_CUTOFF_DATE.getTime() ? byDate.get(day.getTime()) : undefined;
    if (!epoch) {
      return { epochDate: day.toISOString(), actualDogePerMhsDay: null };
    }
    const teh = Number(epoch.totalEffectiveMp);
    const net = Number(epoch.netDistributableDoge);
    return { epochDate: day.toISOString(), actualDogePerMhsDay: teh > 0 ? (net / teh) * 24 : null };
  });

  const [liveRate, exampleDogePerMhsDay] = await Promise.all([
    estimateTodayPlatformRatePerMhsDay(),
    getReferenceDogePerMhsDay(),
  ]);
  const liveToday = { epochDate: today, rate: liveRate };

  return NextResponse.json({ rows, exampleDogePerMhsDay, liveToday });
}
