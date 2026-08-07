import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

// GET /api/referrals/activity — the per-event detail the Refer page's
// aggregate Level 1/2 totals don't show: every individual commission
// credit, which match earned it, which referred wallet triggered it,
// and whether that wallet actually won or lost that match. Commission
// itself is paid on entry regardless of result (doc: "credited
// automatically ... regardless of the match result") — win/loss here
// is just extra context on the underlying match, not a condition.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const me = session.walletProfileId;

  const entries = await db.ledgerEntry.findMany({
    where: {
      walletProfileId: me,
      balanceType: "REFERRAL_USDT",
      reason: { in: ["referral_l1", "referral_l2"] },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const matchIds = [...new Set(entries.map((e) => e.refId).filter((id): id is string => !!id))];
  const matches = await db.match.findMany({
    where: { id: { in: matchIds } },
    include: { participants: { include: { walletProfile: true } } },
  });
  const matchById = new Map(matches.map((m) => [m.id, m]));

  // L1 candidates: wallets I directly referred. L2 candidates: wallets
  // referred by one of MY direct referrals (one hop further out) — the
  // same two-level shape distributeEntryFeeToTreasuryAndReferrals pays.
  const myDirect = await db.referral.findMany({ where: { referrerProfileId: me } });
  const directIds = new Set(myDirect.map((r) => r.referredProfileId));
  const myIndirect = directIds.size
    ? await db.referral.findMany({ where: { referrerProfileId: { in: [...directIds] } } })
    : [];
  const indirectIds = new Set(myIndirect.map((r) => r.referredProfileId));

  const rows = entries.map((e) => {
    const match = e.refId ? matchById.get(e.refId) : undefined;
    const candidateIds = e.reason === "referral_l1" ? directIds : indirectIds;
    const participant = match?.participants.find((p) => candidateIds.has(p.walletProfileId));
    return {
      id: e.id,
      createdAt: e.createdAt.toISOString(),
      level: e.reason === "referral_l1" ? "L1" : "L2",
      amount: Number(e.amount),
      mode: match?.mode ?? null,
      referredAddress: participant?.walletProfile.address ?? null,
      referredNickname: participant?.walletProfile.nickname ?? null,
      won: participant ? Number(participant.rewardUsdt) > 0 : null,
    };
  });

  // Mining referral commission — one row per (day, level), not per
  // referred wallet: creditMiningReferralDoge (src/lib/referrals.ts)
  // aggregates every contributing contract's carve-out into a single
  // daily ledger entry per level, so there's no single "referred
  // wallet" to attribute an individual row to the way match commission
  // rows above can.
  const miningEntries = await db.ledgerEntry.findMany({
    where: {
      walletProfileId: me,
      reason: { in: ["mining_referral_l1", "mining_referral_l2"] },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const miningRows = miningEntries.map((e) => ({
    id: e.id,
    createdAt: e.createdAt.toISOString(),
    level: e.reason === "mining_referral_l1" ? "L1" : "L2",
    amountDoge: Number(e.amount),
  }));

  return NextResponse.json({ rows, miningRows });
}
