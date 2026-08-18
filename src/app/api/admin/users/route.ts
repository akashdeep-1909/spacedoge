import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";
import { getWalletBalances } from "@/lib/balances";

// GET /api/admin/users?q=0xabc&includeBots=true — search by address
// substring, or list most-recently-created wallets when no query is
// given.
//
// Excludes synthetic "bot:<mapSeed>:<i>" profiles (src/app/api/matches/
// route.ts) by default — every match spawns AI opponents that need a
// WalletProfile row to participate via the same schema real players
// use, and there's a fresh one per match (827+ at last count vs ~70
// real users), so they'd otherwise swamp the list 10-to-1. includeBots
// opts into seeing them anyway (src/app/admin/users/page.tsx's "Show
// bot accounts" toggle) — each row's `isBot` flag is what lets the UI
// badge them clearly rather than mixing silently into the real list.
// Always excludes the "platform:treasury" pseudo-wallet (src/lib/
// treasury.ts) either way — that's never a "user" in any sense.
export async function GET(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase();
  const includeBots = request.nextUrl.searchParams.get("includeBots") === "true";
  // Same "hidden unless opted into" convention as includeBots above —
  // a demo/marketing wallet (WalletProfile.isDemo, see its own
  // doc-comment) is a real, non-bot address an admin has manually
  // flagged as not-a-real-user, so it needs a separate opt-in toggle
  // from bots rather than reusing includeBots (src/app/admin/users/
  // page.tsx's own "Show demo accounts" checkbox).
  const includeDemo = request.nextUrl.searchParams.get("includeDemo") === "true";
  const where = {
    AND: [
      ...(includeBots ? [] : [{ address: { not: { startsWith: "bot:" } } }]),
      ...(includeDemo ? [] : [{ isDemo: false }]),
      { address: { not: { startsWith: "platform:" } } },
      ...(q ? [{ address: { contains: q } }] : []),
    ],
  };

  // Wrapped in try/catch specifically so a DB-level failure (e.g. a
  // migration not yet applied on this server, referencing a column
  // that doesn't exist yet — exactly the class of bug this closes)
  // comes back as this route's own {error: "..."} JSON body instead of
  // a bare framework 500 with no message. Without this, the client
  // (useAdminUsers in src/lib/hooks.ts) had nothing to show but a
  // generic "Failed to load users" — confirmed live as a real gap:
  // "here are no user show" gave no hint that the request was actually
  // failing, not just returning zero rows.
  try {
    // 500 covers every real wallet for the foreseeable pre-launch scale
    // this app is at — the admin UI paginates client-side over this same
    // batch (src/app/admin/users/page.tsx), same convention as the
    // Deposits/Withdrawals/Lobbies admin tables. With includeBots on this
    // caps at the 500 most recent rows overall (bots included), same as
    // the real-users-only view — not raised further since this is an
    // explicit opt-in debugging view, not the primary one.
    const [profiles, totalUserCount] = await Promise.all([
      db.walletProfile.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 }),
      db.walletProfile.count({ where }),
    ]);

    // One extra query, not one per row — batch-looked-up the same way
    // batchLookupMiningReferrals (src/lib/referrals.ts) avoids an N+1 for
    // the settlement loop, same reasoning here since this list can be up
    // to 500 rows.
    const referralRows = await db.referral.findMany({
      where: { referredProfileId: { in: profiles.map((p) => p.id) } },
      include: { referrer: { select: { address: true } } },
    });
    const referrerByReferredId = new Map(referralRows.map((r) => [r.referredProfileId, r.referrer.address]));

    const rows = await Promise.all(
      profiles.map(async (p) => ({
        id: p.id,
        address: p.address,
        isBot: p.address.startsWith("bot:"),
        isDemo: p.isDemo,
        riskFlag: p.riskFlag,
        isKol: p.isKol,
        createdAt: p.createdAt,
        referredByAddress: referrerByReferredId.get(p.id) ?? null,
        balances: await getWalletBalances(p.id),
      }))
    );

    return NextResponse.json({ rows, totalUserCount });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load users" }, { status: 500 });
  }
}
