import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";
import { getWalletBalances } from "@/lib/balances";
import { getDepositsReport, getWithdrawalsReport, getMatchesReport, getMiningReport, getTransfersReport } from "@/lib/adminReports";

// GET /api/admin/users/[id]/detail — the full per-user picture behind
// src/app/admin/users/[id]/page.tsx: profile, every balance, and every
// section a "complete user details" view needs (deposits, withdrawals,
// game win/loss, mining, referrals, transfers, and the raw ledger audit
// trail). Reuses the exact same report queries the global /admin/
// reports exports use (src/lib/adminReports.ts), filtered to this one
// wallet — the numbers shown here and the numbers in that user's own
// "Export CSV/PDF" buttons (same routes, ?walletId=this id) can never
// drift apart, since it's literally the same query either way.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id } = await params;
  const profile = await db.walletProfile.findUnique({ where: { id } });
  if (!profile) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const [
    balances,
    deposits,
    withdrawals,
    matches,
    mining,
    transfers,
    referredBy,
    downline,
    recentLedger,
    spentAgg,
    directCount,
    commissionSums,
  ] = await Promise.all([
    getWalletBalances(id),
    getDepositsReport(id),
    getWithdrawalsReport(id),
    getMatchesReport(id),
    getMiningReport(id),
    getTransfersReport(id),
    db.referral.findUnique({ where: { referredProfileId: id }, include: { referrer: { select: { address: true } } } }),
    db.referral.findMany({
      where: { referrerProfileId: id },
      orderBy: { createdAt: "desc" },
      include: { referred: { select: { address: true } } },
    }),
    // Raw append-only ledger — the actual source of truth every balance
    // above is reconstructed from (see balances.ts's own doc-comment:
    // "No administrator can directly edit a displayed balance"). Capped
    // at 300, newest first — an admin auditing "why is this balance
    // what it is" needs the RECENT trail, not literally every entry a
    // long-lived wallet has ever produced; unlike the 5 report types
    // above this isn't one of the CSV/PDF-exportable types, so there's
    // no "unbounded export" expectation to match here.
    db.ledgerEntry.findMany({
      where: { walletProfileId: id },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    // Lifetime "spend" — every PLAY_USDT DEBIT (negative amount:
    // reason "match_entry", plus mining activation/hashrate purchases
    // that also draw from PLAY_USDT). The current balance alone
    // doesn't show this: a wallet that deposited $50 and spent $45 on
    // matches shows a $5 balance either way as a wallet that only ever
    // deposited $5 — this is the lifetime OUTFLOW specifically.
    db.ledgerEntry.aggregate({
      where: { walletProfileId: id, balanceType: "PLAY_USDT", amount: { lt: 0 } },
      _sum: { amount: true },
    }),
    // Same direct/indirect counting rule as /api/admin/overview —
    // scoped to just this wallet as the referrer. Doesn't filter by
    // REAL_USER_WALLET_FILTER the way the platform-wide Overview does:
    // an admin looking at ONE specific user's own downline wants to
    // see everyone they've actually referred, demo-flagged or not —
    // that classification is about platform-wide reporting, not about
    // hiding a real relationship on this user's own page. (indirectCount
    // is computed further below, from `downline` — already being
    // fetched in this same Promise.all — rather than as a second
    // query here, which would otherwise have to `await` inline before
    // this array literal even finishes evaluating, serializing it
    // ahead of every other entry below instead of running in parallel.)
    db.referral.count({ where: { referrerProfileId: id } }),
    // This user's OWN referral earnings — game (USDT) and mining
    // (DOGE) commission, direct (L1) and indirect (L2), same 4 reason
    // codes the Overview page's referral section reads.
    db.ledgerEntry.groupBy({
      by: ["reason"],
      where: { walletProfileId: id, reason: { in: ["referral_l1", "referral_l2", "mining_referral_l1", "mining_referral_l2"] } },
      _sum: { amount: true },
    }),
  ]);

  // Per-downline-member game commission — only feasible for the GAME
  // side (referral_l1 entries carry refType: "Match", refId: <that
  // match's id>, and instant-play/lobby matches have exactly one real
  // human participant, so a match maps 1:1 back to which referred
  // wallet earned this admin the commission). Mining commission is
  // NOT broken out per downline member here — creditMiningReferralDoge
  // (src/lib/referrals.ts) credits ONE aggregated entry per (referrer,
  // level, epoch), summed across every contract that referrer's whole
  // downline ran that day, not one entry per contract/referred wallet
  // — cleanly un-mixing that back into "how much did wallet X
  // specifically earn me" would mean re-deriving each contract's own
  // daily carve from MiningContractAllocation instead of reading the
  // ledger, out of scope for this view. The referralSummary total
  // below still covers mining commission at the whole-user level.
  const directReferredIds = downline.map((r) => r.referredProfileId);
  const gameCommissionByReferredWallet = new Map<string, number>();
  if (directReferredIds.length > 0) {
    const referredMatches = await db.matchParticipant.findMany({
      where: { isBot: false, walletProfileId: { in: directReferredIds } },
      select: { matchId: true, walletProfileId: true },
    });
    const matchIdToReferredWalletId = new Map(referredMatches.map((m) => [m.matchId, m.walletProfileId]));
    if (matchIdToReferredWalletId.size > 0) {
      const l1Entries = await db.ledgerEntry.findMany({
        where: {
          walletProfileId: id,
          reason: "referral_l1",
          refType: "Match",
          refId: { in: [...matchIdToReferredWalletId.keys()] },
        },
        select: { refId: true, amount: true },
      });
      for (const entry of l1Entries) {
        const referredWalletId = matchIdToReferredWalletId.get(entry.refId!);
        if (!referredWalletId) continue;
        gameCommissionByReferredWallet.set(
          referredWalletId,
          (gameCommissionByReferredWallet.get(referredWalletId) ?? 0) + Number(entry.amount)
        );
      }
    }
  }

  // Indirect (L2) downline — everyone referred BY this user's own
  // direct referrals. Shown as its own list (not folded into the L1
  // one) since it's a different relationship: this user never
  // interacted with these wallets directly, they only earn L2
  // commission when one of them plays/mines.
  const indirectDownline =
    directReferredIds.length > 0
      ? await db.referral.findMany({
          where: { referrerProfileId: { in: directReferredIds } },
          orderBy: { createdAt: "desc" },
          include: { referred: { select: { address: true } }, referrer: { select: { address: true } } },
        })
      : [];

  const commissionByReason = Object.fromEntries(
    commissionSums.map((r) => [r.reason, Number(r._sum.amount ?? 0)])
  ) as Record<string, number>;

  return NextResponse.json({
    profile: {
      id: profile.id,
      address: profile.address,
      nickname: profile.nickname,
      riskFlag: profile.riskFlag,
      isKol: profile.isKol,
      isDemo: profile.isDemo,
      dogeAddress: profile.dogeAddress,
      countryCode: profile.countryCode,
      createdAt: profile.createdAt,
      referredByAddress: referredBy?.referrer.address ?? null,
      referralStatus: referredBy?.status ?? null,
    },
    balances,
    totalUsdtSpent: Math.abs(Number(spentAgg._sum.amount ?? 0)),
    referralSummary: {
      directCount,
      indirectCount: indirectDownline.length,
      gameCommissionUsdt: {
        direct: commissionByReason.referral_l1 ?? 0,
        indirect: commissionByReason.referral_l2 ?? 0,
      },
      miningCommissionDoge: {
        direct: commissionByReason.mining_referral_l1 ?? 0,
        indirect: commissionByReason.mining_referral_l2 ?? 0,
      },
    },
    deposits,
    withdrawals,
    matches,
    mining,
    transfers,
    referralDownline: {
      title: "Direct Referral Downline (L1)",
      headers: ["Referred User ID", "Referred Wallet Address", "Status", "Game Commission Earned (USDT)", "Qualified At (UTC)", "Joined At (UTC)"],
      rows: downline.map((r) => [
        r.referredProfileId,
        r.referred.address,
        r.status,
        (gameCommissionByReferredWallet.get(r.referredProfileId) ?? 0).toFixed(8),
        r.qualifiedAt ? r.qualifiedAt.toISOString() : "",
        r.createdAt.toISOString(),
      ]),
    },
    referralDownlineIndirect: {
      title: "Indirect Referral Downline (L2)",
      headers: ["Referred User ID", "Referred Wallet Address", "Came Through (My Direct Referral)", "Status", "Qualified At (UTC)", "Joined At (UTC)"],
      rows: indirectDownline.map((r) => [
        r.referredProfileId,
        r.referred.address,
        r.referrer.address,
        r.status,
        r.qualifiedAt ? r.qualifiedAt.toISOString() : "",
        r.createdAt.toISOString(),
      ]),
    },
    recentLedger: {
      title: "Recent Ledger Entries",
      headers: ["Balance Type", "Amount", "Reason", "Ref Type", "Ref ID", "Admin Actor", "Note", "Created At (UTC)"],
      rows: recentLedger.map((l) => [
        l.balanceType,
        Number(l.amount).toFixed(8),
        l.reason,
        l.refType ?? "",
        l.refId ?? "",
        l.adminActorAddress ?? "",
        l.note ?? "",
        l.createdAt.toISOString(),
      ]),
    },
  });
}
