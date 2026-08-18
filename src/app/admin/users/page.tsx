"use client";

import { useState } from "react";
import Link from "next/link";
import { PaginationControls } from "@/components/PaginationControls";
import { usePagination } from "@/lib/usePagination";
import { useAdminUsers, useSetRiskFlag, useSetKol, useSetReferrer, useCreditUserBalance, type AdminUserRow } from "@/lib/hooks";

const CREDITABLE_BALANCE_TYPES = [
  "PLAY_USDT",
  "GAME_REWARD_USDT",
  "PTS",
  "PENDING_DOGE",
  "AVAILABLE_DOGE",
  "RECYCLED_USDT",
  "REFERRAL_USDT",
] as const;

const BALANCE_TYPE_LABEL: Record<(typeof CREDITABLE_BALANCE_TYPES)[number], string> = {
  PLAY_USDT: "Deposit USDT",
  GAME_REWARD_USDT: "Game Reward USDT",
  PTS: "PTS",
  PENDING_DOGE: "Pending DOGE",
  AVAILABLE_DOGE: "Available DOGE",
  RECYCLED_USDT: "Mining Earnings",
  REFERRAL_USDT: "Referral USDT",
};

export default function AdminUsersPage() {
  const [query, setQuery] = useState("");
  const [showBots, setShowBots] = useState(false);
  const { data, isLoading } = useAdminUsers(query, showBots);
  const paged = usePagination(data?.rows ?? []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-black uppercase tracking-wide">Users</h1>
        <p className="mt-1 text-sm text-muted">
          {data ? `${data.totalUserCount} ${showBots ? "row" : "user"}${data.totalUserCount === 1 ? "" : "s"} total. ` : ""}
          Search by wallet address, or browse the most recent sign-ups. Every balance field is
          shown per user, and any balance can be manually credited or corrected below.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            paged.setPage(1);
          }}
          placeholder="Search address…"
          className="w-full max-w-sm rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={showBots}
            onChange={(e) => {
              setShowBots(e.target.checked);
              paged.setPage(1);
            }}
            className="h-3.5 w-3.5 accent-mint"
          />
          Show bot accounts
        </label>
      </div>

      <div className="flex flex-col gap-3">
        {isLoading ? (
          <p className="game-panel hud-corner rounded-2xl p-5 text-sm text-muted">Loading…</p>
        ) : !data?.rows.length ? (
          <p className="game-panel hud-corner rounded-2xl p-5 text-sm text-muted">No users found.</p>
        ) : (
          paged.pageItems.map((row) => <UserCard key={row.id} row={row} />)
        )}
      </div>
      <PaginationControls
        page={paged.page}
        pageCount={paged.pageCount}
        start={paged.start}
        pageSize={paged.pageSize}
        total={paged.total}
        onChange={paged.setPage}
      />
    </div>
  );
}

const RISK_STYLE: Record<string, string> = {
  blocked: "border-risk/25 bg-risk-soft text-risk",
  review: "border-gold/25 bg-gold-soft text-gold",
};

// `hint` mirrors the exact tooltip copy a real user sees on their own
// dashboard (src/lib/i18n/translations/en.ts's dashboardHome.*Hint /
// wallet.ptsHint) — the admin panel has no InfoTooltip wiring anywhere
// (it's plain English, no i18n, by established convention), so this
// reuses that same copy as a native `title` attribute instead.
// Confirmed live as a real gap: an admin looking at "Mining Earnings:
// $35.00" with no explanation asked "why is this USDT, mining output
// is only DOGE" — Mining Earnings (RECYCLED_USDT) IS genuinely USDT,
// but only because it's DOGE the user already manually converted; the
// still-unconverted portion sits separately in Available DOGE. Not a
// math bug, a missing-context one — the hint makes that relationship
// explicit without needing a whole tooltip component in a panel that
// doesn't use them anywhere else.
const BALANCE_FIELDS: { key: keyof AdminUserRow["balances"]; label: string; hint: string; fmt: (n: number) => string }[] = [
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

function UserCard({ row }: { row: AdminUserRow }) {
  const setRiskFlag = useSetRiskFlag();
  const setKol = useSetKol();
  const [showCredit, setShowCredit] = useState(false);
  const [showReferrer, setShowReferrer] = useState(false);

  return (
    <div className={`game-panel hud-corner relative rounded-2xl p-4 ${row.isBot ? "opacity-70" : ""}`}>
      {row.isBot && (
        <span
          className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full border border-line bg-panel-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted"
          title="AI-controlled opponent, not a real player"
        >
          🤖 Bot
        </span>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex flex-wrap items-center gap-2 break-all font-semibold">
            <Link href={`/admin/users/${row.id}`} className="hover:text-gold hover:underline">
              {row.address}
            </Link>
            {row.riskFlag && (
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${RISK_STYLE[row.riskFlag]}`}>
                {row.riskFlag}
              </span>
            )}
            {row.isKol && (
              <span
                className="rounded-full border border-mint/30 bg-mint-soft px-2 py-0.5 text-[10px] font-bold uppercase text-mint"
                title="Key Opinion Leader, referrals through this wallet unlock the KOL_REFERRAL_BONUS free-play gift"
              >
                KOL
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted">Joined {new Date(row.createdAt).toLocaleDateString()}</p>
          <p className="mt-0.5 text-xs text-muted">
            Referred by:{" "}
            {row.referredByAddress ? (
              <span className="break-all font-semibold text-foreground">{row.referredByAddress}</span>
            ) : (
              <span className="italic opacity-70">none</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-start gap-1.5">
          <Link
            href={`/admin/users/${row.id}`}
            className="rounded-full border border-gold/40 bg-panel px-2.5 py-1 text-[11px] font-semibold text-gold transition hover:bg-gold-soft"
          >
            View Details
          </Link>
          {/* Bots have no real balance to credit and no risk to flag —
              those actions only make sense for real user wallets. */}
          {!row.isBot && (
            <>
            <button
              onClick={() => setShowCredit((v) => !v)}
              className="rounded-full border border-mint/40 bg-panel px-2.5 py-1 text-[11px] font-semibold text-mint transition hover:bg-mint-soft"
            >
              {showCredit ? "Cancel" : "Credit Balance"}
            </button>
            <button
              onClick={() => setRiskFlag.mutate({ id: row.id, riskFlag: "review" })}
              disabled={setRiskFlag.isPending || row.riskFlag === "review"}
              className="rounded-full border border-line bg-panel px-2.5 py-1 text-[11px] font-semibold text-muted transition hover:border-gold/50 disabled:opacity-40"
            >
              Flag review
            </button>
            <button
              onClick={() => setRiskFlag.mutate({ id: row.id, riskFlag: "blocked" })}
              disabled={setRiskFlag.isPending || row.riskFlag === "blocked"}
              className="rounded-full border border-risk/40 bg-panel px-2.5 py-1 text-[11px] font-semibold text-risk transition hover:bg-risk-soft disabled:opacity-40"
            >
              Block
            </button>
            {row.riskFlag && (
              <button
                onClick={() => setRiskFlag.mutate({ id: row.id, riskFlag: null })}
                disabled={setRiskFlag.isPending}
                className="rounded-full border border-mint/40 bg-panel px-2.5 py-1 text-[11px] font-semibold text-mint transition hover:bg-mint-soft disabled:opacity-40"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => setKol.mutate({ id: row.id, isKol: !row.isKol })}
              disabled={setKol.isPending}
              className="rounded-full border border-gold/40 bg-panel px-2.5 py-1 text-[11px] font-semibold text-gold transition hover:bg-gold-soft disabled:opacity-40"
            >
              {row.isKol ? "Unmark KOL" : "Mark KOL"}
            </button>
            <button
              onClick={() => setShowReferrer((v) => !v)}
              className="rounded-full border border-line bg-panel px-2.5 py-1 text-[11px] font-semibold text-muted transition hover:border-mint/50 hover:text-foreground"
            >
              {showReferrer ? "Cancel" : row.referredByAddress ? "Change Referrer" : "Set Referrer"}
            </button>
            </>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {BALANCE_FIELDS.map((f) => (
          <div key={f.key} title={f.hint} className="rounded-lg border border-line bg-panel-2 px-2.5 py-1.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted">{f.label}</p>
            <p className="text-sm font-semibold tabular-nums">{f.fmt(row.balances[f.key])}</p>
          </div>
        ))}
      </div>

      {showCredit && <CreditForm userId={row.id} onDone={() => setShowCredit(false)} />}
      {showReferrer && (
        <ReferrerForm userId={row.id} currentReferrerAddress={row.referredByAddress} onDone={() => setShowReferrer(false)} />
      )}
    </div>
  );
}

function CreditForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const credit = useCreditUserBalance();
  const [balanceType, setBalanceType] = useState<(typeof CREDITABLE_BALANCE_TYPES)[number]>("PLAY_USDT");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setSuccess(null);
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount === 0) {
      setError("Enter a non-zero amount.");
      return;
    }
    try {
      await credit.mutateAsync({ id: userId, balanceType, amount: parsedAmount, note: note.trim() || undefined });
      setSuccess(`${parsedAmount > 0 ? "Credited" : "Debited"} ${Math.abs(parsedAmount)} ${BALANCE_TYPE_LABEL[balanceType]}.`);
      setAmount("");
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to credit balance");
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-mint/25 bg-mint-soft/10 p-3">
      <div className="grid gap-2 sm:grid-cols-4">
        <select
          value={balanceType}
          onChange={(e) => setBalanceType(e.target.value as (typeof CREDITABLE_BALANCE_TYPES)[number])}
          className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm"
        >
          {CREDITABLE_BALANCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {BALANCE_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          type="number"
          step="any"
          placeholder="Amount (negative to debit)"
          className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm sm:col-span-2"
        />
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={credit.isPending || !amount}
          className="btn-game rounded-full px-4 py-1.5 text-xs disabled:opacity-50"
        >
          {credit.isPending ? "Submitting…" : "Apply"}
        </button>
        <button onClick={onDone} className="rounded-full border border-line px-4 py-1.5 text-xs text-muted hover:text-foreground">
          Done
        </button>
        {error && <span className="text-xs text-risk">{error}</span>}
        {success && <span className="text-xs text-mint">{success}</span>}
      </div>
    </div>
  );
}

// Manual override for src/lib/referrals.ts's applyReferralCode — the
// normal path only ever fires once, automatically, the moment a wallet
// FIRST connects via a ?ref= link. This covers everything that can't:
// a user who connected before getting a referral link, fixing a
// mistyped one, or an admin deliberately attributing an already-active
// wallet after the fact. Address input, not a picker — matches how a
// real referral link works (the referrer is identified by their wallet
// address, same as the ?ref= param itself).
function ReferrerForm({
  userId,
  currentReferrerAddress,
  onDone,
}: {
  userId: string;
  currentReferrerAddress: string | null;
  onDone: () => void;
}) {
  const setReferrer = useSetReferrer();
  const [address, setAddress] = useState(currentReferrerAddress ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setSuccess(null);
    try {
      await setReferrer.mutateAsync({ id: userId, referrerAddress: address.trim() || null });
      setSuccess("Referrer updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update referrer");
    }
  }

  async function clear() {
    setError(null);
    setSuccess(null);
    try {
      await setReferrer.mutateAsync({ id: userId, referrerAddress: null });
      setAddress("");
      setSuccess("Referrer cleared.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear referrer");
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-mint/25 bg-mint-soft/10 p-3">
      <div className="grid gap-2 sm:grid-cols-4">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Referrer wallet address (0x…)"
          className="rounded-lg border border-line bg-panel-2 px-3 py-2 font-mono text-sm sm:col-span-3"
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          onClick={submit}
          disabled={setReferrer.isPending || !address.trim()}
          className="btn-game rounded-full px-4 py-1.5 text-xs disabled:opacity-50"
        >
          {setReferrer.isPending ? "Submitting…" : "Set Referrer"}
        </button>
        {currentReferrerAddress && (
          <button
            onClick={clear}
            disabled={setReferrer.isPending}
            className="rounded-full border border-risk/40 px-4 py-1.5 text-xs text-risk hover:bg-risk-soft disabled:opacity-50"
          >
            Clear Referrer
          </button>
        )}
        <button onClick={onDone} className="rounded-full border border-line px-4 py-1.5 text-xs text-muted hover:text-foreground">
          Done
        </button>
        {error && <span className="text-xs text-risk">{error}</span>}
        {success && <span className="text-xs text-mint">{success}</span>}
      </div>
    </div>
  );
}
