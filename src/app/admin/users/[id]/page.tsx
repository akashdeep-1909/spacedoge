"use client";

import { use } from "react";
import Link from "next/link";
import { useAdminUserDetail, type AdminReportTable } from "@/lib/hooks";

const RISK_STYLE: Record<string, string> = {
  blocked: "border-risk/25 bg-risk-soft text-risk",
  review: "border-gold/25 bg-gold-soft text-gold",
};

// (label, fmt) pairs over the same WalletBalances shape admin/users/
// page.tsx's own BALANCE_FIELDS uses — kept as a separate constant
// here rather than importing that one, since this page also wants
// activeMiningPower/lifetimePaidPts labeled identically but doesn't
// need the credit-form machinery that file bundles alongside it.
const BALANCE_FIELDS: { key: string; label: string; fmt: (n: number) => string }[] = [
  { key: "playUsdt", label: "Deposit USDT", fmt: (n) => `$${n.toFixed(2)}` },
  { key: "gameRewardUsdt", label: "Game Reward USDT", fmt: (n) => `$${n.toFixed(2)}` },
  { key: "recycledUsdt", label: "Mining Earnings", fmt: (n) => `$${n.toFixed(2)}` },
  { key: "referralUsdt", label: "Referral USDT", fmt: (n) => `$${n.toFixed(2)}` },
  { key: "pts", label: "PTS", fmt: (n) => n.toFixed(0) },
  { key: "lifetimePaidPts", label: "Lifetime PTS", fmt: (n) => n.toFixed(0) },
  { key: "pendingDoge", label: "Pending DOGE", fmt: (n) => n.toFixed(4) },
  { key: "availableDoge", label: "Available DOGE", fmt: (n) => n.toFixed(4) },
  { key: "activeMiningPower", label: "Hashrate", fmt: (n) => `${n.toFixed(1)} MH/s` },
];

// Report types with a real /api/admin/reports/* export route behind
// them (src/lib/adminReports.ts) — referralDownline/recentLedger below
// are display-only sections on this page, not one of the 5 exportable
// transaction types, so they get no Export buttons.
const EXPORTABLE_SECTIONS: Record<string, string> = {
  deposits: "deposits",
  withdrawals: "withdrawals",
  matches: "matches",
  mining: "mining",
  transfers: "transfers",
};

export default function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, error } = useAdminUserDetail(id);

  if (isLoading) return <p className="p-5 text-sm text-muted">Loading…</p>;
  if (error || !data) return <p className="p-5 text-sm text-risk">{error instanceof Error ? error.message : "User not found."}</p>;

  const { profile, balances } = data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/users" className="text-xs text-muted hover:text-gold">
          ← Back to Users
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="break-all text-lg font-black">{profile.nickname ?? profile.address}</h1>
          {profile.riskFlag && (
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${RISK_STYLE[profile.riskFlag]}`}>
              {profile.riskFlag}
            </span>
          )}
          {profile.isKol && (
            <span className="rounded-full border border-mint/30 bg-mint-soft px-2 py-0.5 text-[10px] font-bold uppercase text-mint">
              KOL
            </span>
          )}
        </div>
        {profile.nickname && <p className="mt-0.5 break-all text-xs text-muted">{profile.address}</p>}
        <p className="mt-1 text-xs text-muted">
          User ID: <span className="font-mono">{profile.id}</span> · Joined {new Date(profile.createdAt).toLocaleString()}
          {profile.dogeAddress && (
            <>
              {" "}
              · DOGE payout: <span className="break-all">{profile.dogeAddress}</span>
            </>
          )}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          Referred by:{" "}
          {profile.referredByAddress ? (
            <span className="break-all font-semibold text-foreground">
              {profile.referredByAddress} ({profile.referralStatus})
            </span>
          ) : (
            <span className="italic opacity-70">none</span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {BALANCE_FIELDS.map((f) => (
          <div key={f.key} className="rounded-lg border border-line bg-panel-2 px-2.5 py-1.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted">{f.label}</p>
            <p className="text-sm font-semibold tabular-nums">
              {f.fmt((balances as unknown as Record<string, number>)[f.key])}
            </p>
          </div>
        ))}
      </div>

      <ReportSection table={data.deposits} exportKey="deposits" walletId={id} />
      <ReportSection table={data.withdrawals} exportKey="withdrawals" walletId={id} />
      <ReportSection table={data.matches} exportKey="matches" walletId={id} />
      <ReportSection table={data.mining} exportKey="mining" walletId={id} />
      <ReportSection table={data.transfers} exportKey="transfers" walletId={id} />
      <ReportSection table={data.referralDownline} walletId={id} />
      <ReportSection table={data.recentLedger} walletId={id} />
    </div>
  );
}

function ReportSection({
  table,
  exportKey,
  walletId,
}: {
  table: AdminReportTable;
  exportKey?: keyof typeof EXPORTABLE_SECTIONS;
  walletId: string;
}) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-black uppercase tracking-widest text-muted">
          ▸ {table.title} <span className="text-foreground">({table.rows.length})</span>
        </h2>
        {exportKey && (
          <div className="flex gap-2">
            <a
              href={`/api/admin/reports/${EXPORTABLE_SECTIONS[exportKey]}?format=csv&walletId=${walletId}`}
              className="rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold text-muted transition hover:border-gold/50 hover:text-gold"
            >
              Export CSV
            </a>
            <a
              href={`/api/admin/reports/${EXPORTABLE_SECTIONS[exportKey]}?format=pdf&walletId=${walletId}`}
              className="rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold text-muted transition hover:border-gold/50 hover:text-gold"
            >
              Export PDF
            </a>
          </div>
        )}
      </div>
      <div className="game-panel hud-corner overflow-x-auto rounded-2xl">
        {table.rows.length === 0 ? (
          <p className="p-4 text-xs text-muted">Nothing here yet.</p>
        ) : (
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead>
              <tr className="border-b border-line text-[10px] uppercase tracking-widest text-muted">
                {table.headers.map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 font-bold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, i) => (
                <tr key={i} className="border-b border-line/60 last:border-0">
                  {row.map((cell, j) => (
                    <td key={j} className="whitespace-nowrap px-3 py-2">
                      {cell === "" ? <span className="opacity-40">—</span> : String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
