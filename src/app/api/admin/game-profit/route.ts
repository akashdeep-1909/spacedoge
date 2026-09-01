import { NextRequest, NextResponse } from "next/server";
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
// referralDirectUsdt/referralIndirectUsdt: the L1/L2 game-referral
// commission this match's own entry fee funded (referral_l1/
// referral_l2, REFERRAL_USDT, always refType "Match", refId = this
// match's id — src/lib/referrals.ts distributeEntryFeeToTreasuryAndReferrals,
// same lookup admin/overview's own referral figures use). Not excluded
// by the demo-match filter above — that filter is about this match's
// own human participant, not about who happens to be the upstream
// referrer being paid. actualProfitUsdt = profitUsdt minus both of
// these — what the platform is left with after also paying out
// referral commission on this match's entry, which the plain
// entries-minus-distributed profitUsdt figure doesn't yet account for.
//
// entriesUsdt/distributedUsdt/profitUsdt (before referral commission)
// are deliberately NOT the same numbers as the "Platform Treasury"
// balance shown elsewhere (src/app/api/admin/overview/route.ts) — that
// one is PLATFORM_FEE_USDT already net of referral commission. Once
// actualProfitUsdt nets that same commission out here too, the two
// should track much more closely (though Treasury also includes
// non-match sources like Unused Prize Surplus from bot-held winning
// slots, which this per-match report folds into distributedUsdt/
// profitUsdt instead of separating out).
//
// ?from=YYYY-MM-DD&to=YYYY-MM-DD (both optional) filters the WHOLE
// report by settledAt (endedAt, falling back to createdAt for the rare
// row with no endedAt) — same "filter everything together" contract
// Mining Profit's own date filter uses. `to` is inclusive of that
// whole day (converted to an exclusive start-of-next-day bound
// internally).
const SETTLED_STATUSES: MatchStatus[] = [MatchStatus.SETTLED_WIN, MatchStatus.SETTLED_LOSS, MatchStatus.SETTLED];

// Generous cap on the underlying match list this report (and its
// match-by-match drill-down) is built from — covers every real paid
// match for the foreseeable pre-launch scale, same reasoning as
// admin/users' own 500-row cap. Revisit (real server-side pagination)
// once match volume is actually this large.
const MATCH_FETCH_LIMIT = 2000;

// Same YYYY-MM-DD day-boundary parser Mining Profit's own route uses —
// null (no bound) rather than a 500 on a missing/malformed param.
function parseDayParam(raw: string | null, endOfDayExclusive: boolean): Date | null {
  if (!raw) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (endOfDayExclusive) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

export async function GET(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const fromDate = parseDayParam(request.nextUrl.searchParams.get("from"), false);
  const toDateExclusive = parseDayParam(request.nextUrl.searchParams.get("to"), true);
  const hasDateFilter = fromDate !== null || toDateExclusive !== null;
  // endedAt is null only for a match that's never actually settled —
  // shouldn't occur alongside SETTLED_STATUSES, but the fallback keeps
  // this filter from silently dropping a row that somehow has neither.
  const settledAtRange = {
    ...(fromDate ? { gte: fromDate } : {}),
    ...(toDateExclusive ? { lt: toDateExclusive } : {}),
  };

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
        ...(hasDateFilter ? { OR: [{ endedAt: settledAtRange }, { endedAt: null, createdAt: settledAtRange }] } : {}),
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
    const qualifyingMatchIds = qualifying.map((m) => m.id);
    const instantMatchIds = qualifying.filter((m) => !m.lobby).map((m) => m.id);
    const lobbyIds = qualifying.filter((m) => m.lobby).map((m) => m.lobby!.id);

    const [instantEntryAgg, lobbyEntryAgg, referralAgg] = await Promise.all([
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
      db.ledgerEntry.groupBy({
        by: ["refId", "reason"],
        where: { reason: { in: ["referral_l1", "referral_l2"] }, refType: "Match", refId: { in: qualifyingMatchIds } },
        _sum: { amount: true },
      }),
    ]);
    const instantEntriesByMatchId = new Map(instantEntryAgg.map((r) => [r.refId, Math.abs(Number(r._sum.amount ?? 0))]));
    const lobbyEntriesByLobbyId = new Map(lobbyEntryAgg.map((r) => [r.refId, Math.abs(Number(r._sum.amount ?? 0))]));
    const referralByMatchId = new Map<string, { direct: number; indirect: number }>();
    for (const r of referralAgg) {
      const entry = referralByMatchId.get(r.refId!) ?? { direct: 0, indirect: 0 };
      const amount = Number(r._sum.amount ?? 0);
      if (r.reason === "referral_l1") entry.direct += amount;
      else entry.indirect += amount;
      referralByMatchId.set(r.refId!, entry);
    }

    const rows = qualifying.map((m) => {
      // Always 1-4 — the participants relation is pre-filtered to
      // isBot: false above, so this is exactly the real human count.
      const humanCount = m.participants.length;
      const entryFeeUsdt = Number(m.entryFeeUsdt);
      const entriesUsdt = m.lobby ? (lobbyEntriesByLobbyId.get(m.lobby.id) ?? 0) : (instantEntriesByMatchId.get(m.id) ?? 0);
      const distributedUsdt = m.participants.reduce((sum, p) => sum + Number(p.rewardUsdt), 0);
      const profitUsdt = entriesUsdt - distributedUsdt;
      const referral = referralByMatchId.get(m.id) ?? { direct: 0, indirect: 0 };
      return {
        id: m.id,
        mode: m.mode,
        humanCount,
        entryFeeUsdt,
        entriesUsdt,
        distributedUsdt,
        profitUsdt,
        referralDirectUsdt: referral.direct,
        referralIndirectUsdt: referral.indirect,
        actualProfitUsdt: profitUsdt - referral.direct - referral.indirect,
        players: m.participants.map((p) => p.walletProfile.nickname || p.walletProfile.address),
        settledAt: (m.endedAt ?? m.createdAt).toISOString(),
      };
    });

    const emptyBucket = () => ({
      matchCount: 0,
      entriesUsdt: 0,
      distributedUsdt: 0,
      profitUsdt: 0,
      referralDirectUsdt: 0,
      referralIndirectUsdt: 0,
      actualProfitUsdt: 0,
    });
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
        b.referralDirectUsdt += r.referralDirectUsdt;
        b.referralIndirectUsdt += r.referralIndirectUsdt;
        b.actualProfitUsdt += r.actualProfitUsdt;
      }
      total.matchCount += 1;
      total.entriesUsdt += r.entriesUsdt;
      total.distributedUsdt += r.distributedUsdt;
      total.profitUsdt += r.profitUsdt;
      total.referralDirectUsdt += r.referralDirectUsdt;
      total.referralIndirectUsdt += r.referralIndirectUsdt;
      total.actualProfitUsdt += r.actualProfitUsdt;
    }

    return NextResponse.json({
      filter: { from: request.nextUrl.searchParams.get("from"), to: request.nextUrl.searchParams.get("to") },
      buckets: [1, 2, 3, 4].map((humanCount) => ({ humanCount, ...bucketsMap.get(humanCount)! })),
      total,
      matches: rows,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load game profit report" }, { status: 500 });
  }
}
