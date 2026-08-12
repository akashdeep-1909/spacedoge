import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { REFERRAL_L1_PCT, REFERRAL_L2_PCT } from "@/lib/referrals";

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

  // Mining referral commission, attributed per referred wallet.
  // creditMiningReferralDoge (src/lib/referrals.ts) itself only ever
  // writes one AGGREGATED ledger entry per (day, level) — summed across
  // every contributing referred wallet's contract that day — so the
  // ledger alone can't say which wallet earned how much. Reconstructed
  // instead from MiningContractAllocation, using the exact dogeUsdtRate
  // stored per row (see schema.prisma) so the DOGE conversion matches
  // the real historical rate, not today's.
  //
  // IMPORTANT: MiningContractAllocation.electricityShareUsdt is the
  // contract's electricity share AFTER the referral carve was already
  // subtracted (mining.ts stores `netElectricityShare`, not the gross
  // `electricityShare` the carve was computed from) — so it can't be
  // multiplied by REFERRAL_L1_PCT/L2_PCT directly, that would silently
  // under-report every row (caught by a smoke test comparing against
  // the real ledger credit — see scripts/smoke-test-mining-referral-
  // detail.mjs). The gross share has to be recovered first by dividing
  // out whichever carve(s) actually applied to that contract:
  //   - a wallet in `indirectIds` (I'm its L2) always had BOTH L1 and
  //     L2 carved from it, because by construction its own direct (L1)
  //     referrer is one of my direct referrals, and that referrer's own
  //     referrer is always me.
  //   - a wallet in `directIds` (I'm its L1) had L2 ALSO carved only if
  //     I myself have a referrer (that L2 carve then went to my own
  //     referrer, not to me) — same for every one of my direct
  //     referrals, since that depends only on my own referral status.
  const iHaveMyOwnReferrer = !!(await db.referral.findUnique({ where: { referredProfileId: me } }));
  const bothCarvedFactor = 1 - REFERRAL_L1_PCT - REFERRAL_L2_PCT;
  const onlyL1CarvedFactor = 1 - REFERRAL_L1_PCT;

  const relevantWalletIds = [...directIds, ...indirectIds];

  const miningRows: { id: string; createdAt: string; level: "L1" | "L2"; amountDoge: number; referredAddress: string | null }[] = [];
  if (relevantWalletIds.length > 0) {
    const allocations = await db.miningContractAllocation.findMany({
      where: { walletProfileId: { in: relevantWalletIds } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        createdAt: true,
        walletProfileId: true,
        electricityShareUsdt: true,
        dogeUsdtRate: true,
        walletProfile: { select: { address: true } },
        epoch: { select: { epochDate: true } },
      },
    });
    for (const a of allocations) {
      const isDirect = directIds.has(a.walletProfileId);
      const pct = isDirect ? REFERRAL_L1_PCT : REFERRAL_L2_PCT;
      const netFactor = isDirect ? (iHaveMyOwnReferrer ? bothCarvedFactor : onlyL1CarvedFactor) : bothCarvedFactor;
      const rate = Number(a.dogeUsdtRate);
      if (rate <= 0 || netFactor <= 0) continue; // defense-in-depth; should never happen for a real settled row
      const grossElectricityShareUsdt = Number(a.electricityShareUsdt) / netFactor;
      const amountDoge = (grossElectricityShareUsdt * pct) / rate;
      if (amountDoge <= 0) continue; // matches creditMiningReferralDoge's own >0 guard
      miningRows.push({
        id: a.id,
        createdAt: a.epoch.epochDate.toISOString(),
        level: isDirect ? "L1" : "L2",
        amountDoge,
        referredAddress: a.walletProfile.address,
      });
    }
  }

  return NextResponse.json({ rows, miningRows });
}
