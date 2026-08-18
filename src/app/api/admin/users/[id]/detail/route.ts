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
  ]);

  return NextResponse.json({
    profile: {
      id: profile.id,
      address: profile.address,
      nickname: profile.nickname,
      riskFlag: profile.riskFlag,
      isKol: profile.isKol,
      dogeAddress: profile.dogeAddress,
      countryCode: profile.countryCode,
      createdAt: profile.createdAt,
      referredByAddress: referredBy?.referrer.address ?? null,
      referralStatus: referredBy?.status ?? null,
    },
    balances,
    deposits,
    withdrawals,
    matches,
    mining,
    transfers,
    referralDownline: {
      title: "Referral Downline",
      headers: ["Referred User ID", "Referred Wallet Address", "Status", "Qualified At (UTC)", "Joined At (UTC)"],
      rows: downline.map((r) => [
        r.referredProfileId,
        r.referred.address,
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
