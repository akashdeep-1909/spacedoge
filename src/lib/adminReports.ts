import { db } from "@/lib/db";

// Shared data source for every admin export (CSV + PDF) AND the
// per-user detail page (src/app/admin/users/[id]/page.tsx) — one query
// per transaction type, in one place, so the numbers shown on screen
// and the numbers in an exported file can never drift apart from two
// separately-maintained queries. Every function takes an OPTIONAL
// walletId: omitted = every wallet platform-wide (the global "Reports"
// page), provided = just that one wallet (the per-user detail page /
// its own export buttons). Deliberately unbounded either way — same
// convention src/app/api/admin/waitlist/export/route.ts already
// established: an export (or a single user's full history) means "the
// whole dataset," not the same small page the paginated list views cap
// at.
//
// Every `rows` array is already flattened to plain string/number cells
// in COLUMN ORDER matching `headers` — ready to hand straight to
// buildCsv() (src/lib/csvExport.ts) or renderReportPdf()
// (src/lib/pdfExport.tsx) with no per-export-type branching in either
// of those. Dates are ISO strings (UTC, unambiguous in a CSV opened by
// anyone in any timezone) rather than a locale-formatted string.
export interface ReportTable {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  filenameBase: string;
}

export async function getDepositsReport(walletId?: string): Promise<ReportTable> {
  const rows = await db.onchainDeposit.findMany({
    where: walletId ? { walletProfileId: walletId } : undefined,
    orderBy: { createdAt: "desc" },
    include: { walletProfile: { select: { address: true } } },
  });
  return {
    title: "Deposits",
    headers: [
      "User ID",
      "Wallet Address",
      "Chain",
      "Amount (USDT)",
      "Status",
      "Source",
      "Confirmations",
      "Tx Hash",
      "Created At (UTC)",
      "Credited At (UTC)",
    ],
    rows: rows.map((r) => [
      r.walletProfileId ?? "",
      // Unmatched deposits (walletProfileId null — the sender address
      // matched no signed-in wallet) still need SOME address shown —
      // fromAddress is the only one available for those.
      r.walletProfile?.address ?? r.fromAddress,
      r.chain,
      Number(r.amount).toFixed(2),
      r.status,
      r.source,
      r.confirmations,
      r.txHash,
      r.createdAt.toISOString(),
      r.creditedAt ? r.creditedAt.toISOString() : "",
    ]),
    filenameBase: "deposits",
  };
}

export async function getWithdrawalsReport(walletId?: string): Promise<ReportTable> {
  const rows = await db.withdrawal.findMany({
    where: walletId ? { walletProfileId: walletId } : undefined,
    orderBy: { createdAt: "desc" },
    include: { walletProfile: { select: { address: true } } },
  });
  return {
    title: "Withdrawals",
    headers: [
      "User ID",
      "Wallet Address",
      "Balance Type",
      "Chain",
      "Destination Address",
      "Amount",
      "Network Fee (USDT)",
      "Status",
      "Tx Hash",
      "Created At (UTC)",
      "Completed At (UTC)",
    ],
    rows: rows.map((r) => [
      r.walletProfileId,
      r.walletProfile.address,
      r.balanceType,
      r.chain,
      r.destinationAddress,
      Number(r.amount).toFixed(8),
      r.networkFeeUsdt !== null ? Number(r.networkFeeUsdt).toFixed(8) : "",
      r.status,
      r.txHash ?? "",
      r.createdAt.toISOString(),
      r.completedAt ? r.completedAt.toISOString() : "",
    ]),
    filenameBase: "withdrawals",
  };
}

// "Game win/loss" — MatchParticipant is the per-user row of a Match
// (score/rank/reward), joined back to the match itself for mode/status/
// economics. isBot: false always — a bot opponent has no real user
// behind it, so it's never relevant to a user-facing financial/activity
// report (same exclusion src/app/api/admin/users/route.ts already
// applies to the Users list by default).
export async function getMatchesReport(walletId?: string): Promise<ReportTable> {
  const rows = await db.matchParticipant.findMany({
    where: { isBot: false, ...(walletId ? { walletProfileId: walletId } : {}) },
    orderBy: { createdAt: "desc" },
    include: {
      walletProfile: { select: { address: true } },
      match: { select: { mode: true, status: true, entryFeeUsdt: true, prizePoolUsdt: true, startedAt: true, endedAt: true } },
    },
  });
  return {
    title: "Game Results (Win / Loss)",
    headers: [
      "User ID",
      "Wallet Address",
      "Mode",
      "Match Status",
      "Score",
      "Rank",
      "Reward (USDT)",
      "Entry Fee (USDT)",
      "Prize Pool (USDT)",
      "Played At (UTC)",
    ],
    rows: rows.map((r) => [
      r.walletProfileId,
      r.walletProfile.address,
      r.match.mode,
      r.match.status,
      r.score,
      r.rank ?? "",
      Number(r.rewardUsdt).toFixed(2),
      Number(r.match.entryFeeUsdt).toFixed(2),
      Number(r.match.prizePoolUsdt).toFixed(2),
      r.createdAt.toISOString(),
    ]),
    filenameBase: "game-results",
  };
}

export async function getMiningReport(walletId?: string): Promise<ReportTable> {
  const rows = await db.miningContract.findMany({
    where: walletId ? { walletProfileId: walletId } : undefined,
    orderBy: { createdAt: "desc" },
    include: { walletProfile: { select: { address: true } } },
  });
  return {
    title: "Mining Contracts",
    headers: [
      "User ID",
      "Wallet Address",
      "Level",
      "Mining Power (MH/s)",
      "Term (Days)",
      "Price Paid (USDT)",
      "Target ROI %",
      "Credited So Far (USDT-equiv)",
      "Active",
      "Starts At (UTC)",
      "Expires At (UTC)",
      "Reconciled At (UTC)",
      "Final Shortfall (USDT)",
    ],
    rows: rows.map((r) => [
      r.walletProfileId,
      r.walletProfile.address,
      r.level,
      Number(r.miningPower).toFixed(2),
      r.termDays,
      Number(r.pricePaidUsdt).toFixed(2),
      (Number(r.targetRoiPct) * 100).toFixed(2),
      Number(r.cumulativeCreditedUsdtEquiv).toFixed(4),
      r.active ? "Yes" : "No",
      r.startsAt.toISOString(),
      r.expiresAt.toISOString(),
      r.reconciledAt ? r.reconciledAt.toISOString() : "",
      r.finalShortfallUsdt !== null ? Number(r.finalShortfallUsdt).toFixed(4) : "",
    ]),
    filenameBase: "mining-contracts",
  };
}

// Internal (user-to-user) transfers — not one of the 4 headline types
// the reporting UI leads with, but cheap to add given /admin/transfers
// already lists these platform-wide; included as a 5th report type
// (and a section on the per-user detail page) rather than leaving the
// one remaining balance-moving action with no export at all.
export async function getTransfersReport(walletId?: string): Promise<ReportTable> {
  const rows = await db.internalTransfer.findMany({
    where: walletId ? { OR: [{ fromWalletProfileId: walletId }, { toWalletProfileId: walletId }] } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      fromWalletProfile: { select: { address: true } },
      toWalletProfile: { select: { address: true } },
    },
  });
  return {
    title: "Internal Transfers",
    headers: [
      "From User ID",
      "From Wallet Address",
      "To User ID",
      "To Wallet Address",
      "Balance Type",
      "Amount",
      "Note",
      "Created At (UTC)",
    ],
    rows: rows.map((r) => [
      r.fromWalletProfileId,
      r.fromWalletProfile.address,
      r.toWalletProfileId,
      r.toWalletProfile.address,
      r.balanceType,
      Number(r.amount).toFixed(8),
      r.note ?? "",
      r.createdAt.toISOString(),
    ]),
    filenameBase: "transfers",
  };
}
