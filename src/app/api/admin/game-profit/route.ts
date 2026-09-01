import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";
import { MatchStatus } from "@/generated/prisma/enums";

// GET /api/admin/game-profit — "how much did players actually earn vs.
// how much did the platform keep," broken down by how many REAL humans
// were in the room (1 = instant play, always 1 human + 3 bots; 2-4 =
// a "Play with Friends" lobby with that many humans, remaining seats
// bot-filled). User's own framing: "1 player play game other or bots,
// how much PTS player earn - that and the rest amount goes to platform
// as profit."
//
// distributedUsdt = the sum of MatchParticipant.rewardUsdt across only
// the REAL (non-bot) participants — that column already holds exactly
// what was actually PTS-credited to a human (0 for a bot's displayed-
// but-never-paid tier value, 0 for a blocked/Practice score — see
// /settle and /results' own doc-comments).
//
// entriesUsdt is deliberately read straight off the ACTUAL entry-fee
// ledger debits, not computed as humanCount * entryFeeUsdt — confirmed
// live those two disagree: a small cohort of old matches (pre-dating
// this feature, likely early test/seed data) have a real human
// participant and a real entryFeeUsdt but no matching debit anywhere
// in the ledger, so the theoretical formula silently overstated
// "collected" for them. Instant-play debits are match_entry (refType
// Match, refId = the match itself); lobby-originated debits are
// match_entry_hold (refType GameLobby, refId = the lobby, one hold per
// joining human, released via match_entry_hold_release only if that
// human left before the lobby finalized) — summing BOTH hold reasons
// per lobby id nets out any released-then-rejoined holds to the actual
// amount still collected for that lobby's finalized match.
//
// Deliberately NOT the same number as the "Platform Treasury" balance
// shown elsewhere (src/app/api/admin/overview/route.ts) — that one is
// PLATFORM_FEE_USDT net of referral commission already paid out to
// referrers, i.e. what the platform is left holding after paying
// everyone. This report answers a narrower, more intuitive question
// (real entries collected vs. what players themselves walked away
// with) and says nothing about referral payouts, which come out of
// the platform's share afterward.
const SETTLED_STATUSES: MatchStatus[] = [MatchStatus.SETTLED_WIN, MatchStatus.SETTLED_LOSS, MatchStatus.SETTLED];

// Generous cap on the underlying match list this report (and its
// match-by-match drill-down) is built from — covers every real paid
// match for the foreseeable pre-launch scale, same reasoning as
// admin/users' own 500-row cap. Revisit (real server-side pagination)
// once match volume is actually this large.
const MATCH_FETCH_LIMIT = 2000;

export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  try {
    // Same match-traceable demo exclusion admin/overview's own
    // demoMatchIds uses for Platform Treasury/Unused Prize Surplus — a
    // match counts as "demo" if any of its real participants is an
    // admin-flagged demo/marketing wallet (WalletProfile.isDemo).
    const demoMatchIds = new Set(
      (
        await db.matchParticipant.findMany({
          where: { isBot: false, walletProfile: { isDemo: true } },
          select: { matchId: true },
        })
      ).map((p) => p.matchId)
    );

    const matches = await db.match.findMany({
      where: {
        status: { in: SETTLED_STATUSES },
        entryFeeUsdt: { gt: 0 }, // excludes Practice and every free/prefunded promo mode
      },
      orderBy: { endedAt: "desc" },
      take: MATCH_FETCH_LIMIT,
      include: {
        participants: {
          where: { isBot: false },
          select: { rewardUsdt: true, walletProfile: { select: { address: true, nickname: true } } },
        },
        lobby: { select: { id: true } },
      },
    });

    const qualifying = matches.filter((m) => !demoMatchIds.has(m.id));
    const instantMatchIds = qualifying.filter((m) => !m.lobby).map((m) => m.id);
    const lobbyIds = qualifying.filter((m) => m.lobby).map((m) => m.lobby!.id);

    const [instantEntryAgg, lobbyEntryAgg] = await Promise.all([
      db.ledgerEntry.groupBy({
        by: ["refId"],
        where: { reason: "match_entry", refType: "Match", refId: { in: instantMatchIds } },
        _sum: { amount: true },
      }),
      db.ledgerEntry.groupBy({
        by: ["refId"],
        where: { reason: { in: ["match_entry_hold", "match_entry_hold_release"] }, refType: "GameLobby", refId: { in: lobbyIds } },
        _sum: { amount: true },
      }),
    ]);
    const instantEntriesByMatchId = new Map(instantEntryAgg.map((r) => [r.refId, Math.abs(Number(r._sum.amount ?? 0))]));
    const lobbyEntriesByLobbyId = new Map(lobbyEntryAgg.map((r) => [r.refId, Math.abs(Number(r._sum.amount ?? 0))]));

    const rows = qualifying.map((m) => {
      // Always 1-4 — the participants relation is pre-filtered to
      // isBot: false above, so this is exactly the real human count.
      const humanCount = m.participants.length;
      const entryFeeUsdt = Number(m.entryFeeUsdt);
      const entriesUsdt = m.lobby ? (lobbyEntriesByLobbyId.get(m.lobby.id) ?? 0) : (instantEntriesByMatchId.get(m.id) ?? 0);
      const distributedUsdt = m.participants.reduce((sum, p) => sum + Number(p.rewardUsdt), 0);
      return {
        id: m.id,
        mode: m.mode,
        humanCount,
        entryFeeUsdt,
        entriesUsdt,
        distributedUsdt,
        profitUsdt: entriesUsdt - distributedUsdt,
        players: m.participants.map((p) => p.walletProfile.nickname || p.walletProfile.address),
        settledAt: (m.endedAt ?? m.createdAt).toISOString(),
      };
    });

    const emptyBucket = () => ({ matchCount: 0, entriesUsdt: 0, distributedUsdt: 0, profitUsdt: 0 });
    const bucketsMap = new Map<number, ReturnType<typeof emptyBucket>>([
      [1, emptyBucket()],
      [2, emptyBucket()],
      [3, emptyBucket()],
      [4, emptyBucket()],
    ]);
    const total = emptyBucket();
    for (const r of rows) {
      const b = bucketsMap.get(r.humanCount);
      if (b) {
        b.matchCount += 1;
        b.entriesUsdt += r.entriesUsdt;
        b.distributedUsdt += r.distributedUsdt;
        b.profitUsdt += r.profitUsdt;
      }
      total.matchCount += 1;
      total.entriesUsdt += r.entriesUsdt;
      total.distributedUsdt += r.distributedUsdt;
      total.profitUsdt += r.profitUsdt;
    }

    return NextResponse.json({
      buckets: [1, 2, 3, 4].map((humanCount) => ({ humanCount, ...bucketsMap.get(humanCount)! })),
      total,
      matches: rows,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load game profit report" }, { status: 500 });
  }
}
