"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useAdminUserDetail, useSetDemo, useSetWithdrawalRestriction, type AdminReportTable } from "@/lib/hooks";

const RISK_STYLE: Record<string, string> = {
  blocked: "border-risk/25 bg-risk-soft text-risk",
  review: "border-gold/25 bg-gold-soft text-gold",
};

// (label, fmt) pairs over the same WalletBalances shape admin/users/
// page.tsx's own BALANCE_FIELDS uses — kept as a separate constant
// here rather than importing that one, since this page also wants
// activeMiningPower/lifetimePaidPts labeled identically but doesn't
// need the credit-form machinery that file bundles alongside it.
// `hint` mirrors src/app/admin/users/page.tsx's own BALANCE_FIELDS —
// see that file's doc-comment for why this exists (admin has no
// InfoTooltip anywhere; a `title` attribute is the plain-HTML
// equivalent, reusing the exact copy a real user sees on their own
// dashboard).
const BALANCE_FIELDS: { key: string; label: string; hint: string; fmt: (n: number) => string }[] = [
  { key: "playUsdt", label: "Deposit USDT", hint: "Play Game, Activate Mining, Buy Hashrate, Transfer — not withdrawable directly", fmt: (n) => `$${n.toFixed(2)}` },
  { key: "gameRewardUsdt", label: "Game Reward USDT", hint: "From match wins/PTS conversion — Activate Mining, Buy Hashrate, Transfer, Withdrawable", fmt: (n) => `$${n.toFixed(2)}` },
  { key: "recycledUsdt", label: "Mining Earnings", hint: "USDT from CONVERTED DOGE (see Available DOGE for the unconverted portion) — Withdrawable", fmt: (n) => `$${n.toFixed(2)}` },
  { key: "referralUsdt", label: "Referral USDT", hint: "L1 5% + L2 2% of referred wallets' platform fee — Withdrawable", fmt: (n) => `$${n.toFixed(2)}` },
  { key: "pts", label: "PTS", hint: "Spendable points from paid match wins — convert to Game Reward USDT at a fixed 1000:1 rate", fmt: (n) => n.toFixed(0) },
  { key: "lifetimePaidPts", label: "Lifetime PTS", hint: "Total ever earned from paid matches — never decreases, separate from the spendable PTS balance", fmt: (n) => n.toFixed(0) },
  { key: "pendingDoge", label: "Pending DOGE", hint: "Calculated mining allocation awaiting daily reconciliation — not yet spendable", fmt: (n) => n.toFixed(4) },
  { key: "availableDoge", label: "Available DOGE", hint: "Reconciled raw DOGE mining output, still unconverted — Withdrawable, or convert to Mining Earnings (USDT)", fmt: (n) => n.toFixed(4) },
  { key: "activeMiningPower", label: "Hashrate", hint: "Active, time-bound MH/s from unexpired mining contracts", fmt: (n) => `${n.toFixed(1)} MH/s` },
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
  const setDemo = useSetDemo();
  const setWithdrawalRestriction = useSetWithdrawalRestriction();
  const [showRestrict, setShowRestrict] = useState(false);

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
          {profile.kolVipTierLabel && (
            <span
              className="rounded-full border border-gold/30 bg-gold-soft px-2 py-0.5 text-[10px] font-bold uppercase text-gold"
              title={`Most recently confirmed VIP tier, ${profile.kolVipPeriodMonth} — full history in the KOL VIP Payouts section below`}
            >
              👑 {profile.kolVipTierLabel}
            </span>
          )}
          {profile.isDemo && (
            <span
              className="rounded-full border border-gold/30 bg-gold-soft px-2 py-0.5 text-[10px] font-bold uppercase text-gold"
              title="Admin-flagged demo/marketing account — real wallet, excluded from the default Users list/count only"
            >
              🎭 Demo
            </span>
          )}
          <button
            onClick={() => setDemo.mutate({ id: profile.id, isDemo: !profile.isDemo })}
            disabled={setDemo.isPending}
            title="Admin-only classification — has no effect on what this wallet itself sees or can do"
            className="rounded-full border border-gold/40 bg-panel px-2.5 py-0.5 text-[10px] font-semibold text-gold transition hover:bg-gold-soft disabled:opacity-40"
          >
            {profile.isDemo ? "Unmark Demo" : "Mark Demo"}
          </button>
          {profile.withdrawalRestricted && (
            <span
              className="rounded-full border border-risk/30 bg-risk-soft px-2 py-0.5 text-[10px] font-bold uppercase text-risk"
              title={`Reason: ${profile.withdrawalRestrictedNote ?? "(no note)"}`}
            >
              🚫 Withdrawal Restricted
            </span>
          )}
          {profile.withdrawalRestricted ? (
            <button
              onClick={() => setWithdrawalRestriction.mutate({ id: profile.id, restricted: false })}
              disabled={setWithdrawalRestriction.isPending}
              className="rounded-full border border-mint/40 bg-panel px-2.5 py-0.5 text-[10px] font-semibold text-mint transition hover:bg-mint-soft disabled:opacity-40"
            >
              Unrestrict Withdrawal
            </button>
          ) : (
            <button
              onClick={() => setShowRestrict((v) => !v)}
              className="rounded-full border border-risk/40 bg-panel px-2.5 py-0.5 text-[10px] font-semibold text-risk transition hover:bg-risk-soft"
            >
              {showRestrict ? "Cancel" : "Restrict Withdrawal"}
            </button>
          )}
        </div>
        {setWithdrawalRestriction.error && (
          <p className="mt-1 text-[11px] text-risk">
            {setWithdrawalRestriction.error instanceof Error
              ? setWithdrawalRestriction.error.message
              : "Failed to update withdrawal restriction."}
          </p>
        )}
        {profile.withdrawalRestricted && (
          <p className="mt-1 text-xs text-risk">
            Withdrawal remark: <span className="font-semibold">{profile.withdrawalRestrictedNote}</span>
            {profile.withdrawalRestrictedAt && (
              <span className="text-muted"> · set {new Date(profile.withdrawalRestrictedAt).toLocaleString()}</span>
            )}
          </p>
        )}
        {showRestrict && !profile.withdrawalRestricted && (
          <RestrictWithdrawalForm userId={profile.id} onDone={() => setShowRestrict(false)} />
        )}
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
          <div key={f.key} title={f.hint} className="rounded-lg border border-line bg-panel-2 px-2.5 py-1.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted">{f.label}</p>
            <p className="text-sm font-semibold tabular-nums">
              {f.fmt((balances as unknown as Record<string, number>)[f.key])}
            </p>
          </div>
        ))}
        <div
          title="Lifetime PLAY_USDT outflow — match entries, mining activation, hashrate purchases. The current balance alone doesn't show this."
          className="rounded-lg border border-line bg-panel-2 px-2.5 py-1.5"
        >
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted">Total USDT Spent (lifetime)</p>
          <p className="text-sm font-semibold tabular-nums">${data.totalUsdtSpent.toFixed(2)}</p>
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-xs font-black uppercase tracking-widest text-muted">▸ Referral Summary</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryTile label="Direct Referrals (L1)" value={String(data.referralSummary.directCount)} />
          <SummaryTile label="Indirect Referrals (L2)" value={String(data.referralSummary.indirectCount)} />
          <SummaryTile label="Game Commission — Direct" value={`$${data.referralSummary.gameCommissionUsdt.direct.toFixed(2)}`} />
          <SummaryTile label="Game Commission — Indirect" value={`$${data.referralSummary.gameCommissionUsdt.indirect.toFixed(2)}`} />
          <SummaryTile label="Mining Commission — Direct" value={`${data.referralSummary.miningCommissionDoge.direct.toFixed(4)} DOGE`} />
          <SummaryTile label="Mining Commission — Indirect" value={`${data.referralSummary.miningCommissionDoge.indirect.toFixed(4)} DOGE`} />
        </div>
      </section>

      <ReportSection table={data.deposits} exportKey="deposits" walletId={id} />
      <ReportSection table={data.withdrawals} exportKey="withdrawals" walletId={id} />
      <ReportSection table={data.matches} exportKey="matches" walletId={id} />
      <ReportSection table={data.mining} exportKey="mining" walletId={id} />
      <ReportSection table={data.transfers} exportKey="transfers" walletId={id} />
      {/* Game commission ("Game Commission Earned (USDT)" column) is
          broken out per direct downline member — feasible since each
          referral_l1 ledger entry is tied to one specific match, and a
          match has exactly one real human participant. Mining
          commission is NOT broken out per row here — see this table's
          own headers/route doc-comment for why (creditMiningReferralDoge
          aggregates a whole epoch's carve across a referrer's entire
          downline into one ledger entry, not one per contract/referred
          wallet) — the Referral Summary above still covers it at the
          whole-user level. */}
      <ReportSection table={data.referralDownline} walletId={id} />
      <ReportSection table={data.referralDownlineIndirect} walletId={id} />
      <ReportSection table={data.kolVipPayouts} walletId={id} />
      <ReportSection table={data.recentLedger} walletId={id} />
    </div>
  );
}

// Same required-note pattern as admin/users/page.tsx's own
// RestrictWithdrawalForm — kept as a separate copy here rather than a
// shared import since this page has its own single-profile layout
// conventions (SummaryTile, etc.) rather than UserCard's list-row ones.
function RestrictWithdrawalForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const setWithdrawalRestriction = useSetWithdrawalRestriction();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!note.trim()) {
      setError("A remark is required so the user (and any admin later) knows why.");
      return;
    }
    try {
      await setWithdrawalRestriction.mutateAsync({ id: userId, restricted: true, note: note.trim() });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restrict withdrawal");
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-risk/25 bg-risk-soft/10 p-3">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Remark — why is this wallet being restricted? (shown to the user)"
        className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={setWithdrawalRestriction.isPending || !note.trim()}
          className="rounded-full border border-risk/40 bg-panel px-4 py-1.5 text-xs font-semibold text-risk transition hover:bg-risk-soft disabled:opacity-50"
        >
          {setWithdrawalRestriction.isPending ? "Restricting…" : "Restrict Withdrawal"}
        </button>
        <button onClick={onDone} className="rounded-full border border-line px-4 py-1.5 text-xs text-muted hover:text-foreground">
          Cancel
        </button>
        {error && <span className="text-xs text-risk">{error}</span>}
      </div>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel-2 px-2.5 py-1.5">
      <p className="text-[9px] font-bold uppercase tracking-widest text-muted">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
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
