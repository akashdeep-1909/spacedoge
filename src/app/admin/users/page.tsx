"use client";

import { useState } from "react";
import Link from "next/link";
import { PaginationControls } from "@/components/PaginationControls";
import { usePagination } from "@/lib/usePagination";
import {
  useAdminUsers,
  useSetRiskFlag,
  useSetKol,
  useSetDemo,
  useBulkSetDemo,
  useClearAllDemo,
  useSetReferrer,
  useCreditUserBalance,
  type AdminUserRow,
} from "@/lib/hooks";

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

const USER_VIEWS = ["Real Users", "Demo Accounts"] as const;

export default function AdminUsersPage() {
  const [query, setQuery] = useState("");
  const [showBots, setShowBots] = useState(false);
  // A real either/or SEPARATION between real and demo wallets, not a
  // checkbox that mixes demo accounts into the same list (that's what
  // "Show bot accounts" below still does, deliberately — bots and demo
  // wallets are different concepts: every bot is synthetic/obviously
  // not a user either way, so revealing them IN PLACE alongside real
  // ones is fine; a demo wallet is a real address an admin is
  // specifically trying to keep OUT of the "real users" picture, which
  // needs an actual separate view, not a toggle that adds it back in).
  const [view, setView] = useState<(typeof USER_VIEWS)[number]>("Real Users");
  const demoOnly = view === "Demo Accounts";
  const { data, isLoading, error } = useAdminUsers(query, showBots, demoOnly);
  const paged = usePagination(data?.rows ?? []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-black uppercase tracking-wide">Users</h1>
        <p className="mt-1 text-sm text-muted">
          {data
            ? `${data.totalUserCount} ${demoOnly ? "demo account" : showBots ? "row" : "user"}${data.totalUserCount === 1 ? "" : "s"} total. `
            : ""}
          Search by wallet address, or browse the most recent sign-ups. Every balance field is
          shown per user, and any balance can be manually credited or corrected below.
        </p>
      </div>

      <BulkDemoPanel />

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
        <div className="flex gap-1 rounded-full border border-line bg-panel p-1 text-xs font-semibold">
          {USER_VIEWS.map((v) => (
            <button
              key={v}
              onClick={() => {
                setView(v);
                paged.setPage(1);
              }}
              className={`rounded-full px-3 py-1.5 transition ${
                view === v ? "bg-gold-soft text-gold" : "text-muted hover:text-foreground"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        {/* Only meaningful on the Real Users side — the Demo Accounts
            view is already its own exclusive filter, a bot could
            technically also be marked isDemo but that's not a real
            scenario worth a 2x2 toggle matrix for. */}
        {!demoOnly && (
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
        )}
      </div>

      <div className="flex flex-col gap-3">
        {isLoading ? (
          <p className="game-panel hud-corner rounded-2xl p-5 text-sm text-muted">Loading…</p>
        ) : error ? (
          // A fetch failure used to render as an indistinguishable
          // "No users found." — confirmed live as part of a real bug
          // report ("no user show"): that made a genuine server error
          // look identical to "there just aren't any," with nothing
          // telling the admin (or whoever's debugging it) what actually
          // went wrong.
          <p className="game-panel hud-corner rounded-2xl p-5 text-sm text-risk">
            {error instanceof Error ? error.message : "Failed to load users."}
          </p>
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

// Paste a list of wallet IDs and/or addresses (one per line, or
// comma/space-separated — split on any whitespace/comma) to mark them
// all as demo/marketing accounts in one go, rather than opening each
// user's card individually. Collapsed by default — most visits to this
// page aren't doing a bulk operation, and a permanently-open textarea
// pushed the actual user list further down for zero benefit.
function BulkDemoPanel() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const bulkSetDemo = useBulkSetDemo();
  const clearAllDemo = useClearAllDemo();
  const [clearedCount, setClearedCount] = useState<number | null>(null);

  async function clearAll() {
    setClearedCount(null);
    // window.confirm, not a custom modal — matches every other
    // destructive-feeling admin action in this codebase (none of them
    // use a bespoke confirm dialog), and this one specifically needs
    // one: it touches every currently demo-flagged wallet at once, no
    // way to preview or undo other than manually re-marking them.
    if (!window.confirm("Unmark ALL demo-flagged wallets and count them as real users again? This can't be undone in one click.")) {
      return;
    }
    const res = await clearAllDemo.mutateAsync();
    setClearedCount(res.clearedCount);
  }
  // isDemo carried alongside the result — confirmed live as a real gap:
  // "not even show proper success message is marked demo or marked
  // undemo" — {updatedCount} alone reads identically whichever button
  // was clicked, with nothing distinguishing "5 wallet(s) MARKED demo"
  // from "5 wallet(s) UNMARKED".
  const [result, setResult] = useState<{ updatedCount: number; unmatched: string[]; isDemo: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function parseIdentifiers(): string[] {
    return text
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function apply(isDemo: boolean) {
    setResult(null);
    setError(null);
    const identifiers = parseIdentifiers();
    if (identifiers.length === 0) return;
    try {
      const res = await bulkSetDemo.mutateAsync({ identifiers, isDemo });
      setResult({ ...res, isDemo });
      // Cleared only on success, not on a failed attempt — a failure
      // means nothing actually happened, so the admin still needs
      // their pasted list sitting there to retry rather than having to
      // re-paste it from scratch. Confirmed live as a real gap: the box
      // never cleared even on a genuinely successful update, leaving no
      // visible confirmation that anything had changed beyond a small
      // text line easy to miss.
      if (res.updatedCount > 0) setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to bulk-update demo flag.");
    }
  }

  return (
    <div className="game-panel hud-corner rounded-2xl p-4">
      <button onClick={() => setOpen((v) => !v)} className="text-xs font-bold uppercase tracking-widest text-gold">
        {open ? "▾" : "▸"} Bulk mark demo accounts
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-xs text-muted">
            Paste a list of wallet IDs or addresses (any mix, one per line or separated by commas/spaces). Marking a
            wallet Demo has no effect on what it can do or see — it only moves it out of the &ldquo;Real Users&rdquo;
            tab above and into its own separate &ldquo;Demo Accounts&rdquo; tab.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder={"0xabc...\ncmXXXXXXXXXXXXXXXXXXXXXXXX\n..."}
            className="rounded-lg border border-line bg-panel-2 px-3 py-2 font-mono text-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => apply(true)}
              disabled={bulkSetDemo.isPending || parseIdentifiers().length === 0}
              className="btn-game-outline rounded-full px-4 py-1.5 text-xs disabled:opacity-50"
            >
              {bulkSetDemo.isPending ? "Applying…" : "Mark as Demo"}
            </button>
            <button
              onClick={() => apply(false)}
              disabled={bulkSetDemo.isPending || parseIdentifiers().length === 0}
              className="rounded-full border border-line px-4 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-50"
            >
              Unmark Demo
            </button>
          </div>
          {error && <p className="text-xs text-risk">{error}</p>}
          {result && (
            <p className="text-xs">
              <span className={result.updatedCount > 0 ? "text-mint" : "text-muted"}>
                {result.updatedCount === 0
                  ? "No wallets matched."
                  : `${result.updatedCount} wallet(s) ${result.isDemo ? "marked as Demo" : "unmarked from Demo"}.`}
              </span>
              {result.unmatched.length > 0 && (
                <span className="ml-2 text-risk">
                  {result.unmatched.length} not found: {result.unmatched.join(", ")}
                </span>
              )}
            </p>
          )}

          {/* Separate from the paste-a-list flow above — this needs no
              input at all, it just resets EVERYONE currently flagged.
              Confirmed live as a real need: an admin tried the bulk-mark
              box above, ended up with 100+ real wallets flagged demo,
              and had no way back short of re-gathering every one of
              those addresses to paste in again. */}
          <div className="mt-1 border-t border-line pt-2.5">
            <button
              onClick={clearAll}
              disabled={clearAllDemo.isPending}
              className="rounded-full border border-risk/40 px-4 py-1.5 text-xs text-risk hover:bg-risk-soft disabled:opacity-50"
            >
              {clearAllDemo.isPending ? "Clearing…" : "Unmark ALL Demo Accounts"}
            </button>
            {clearedCount !== null && (
              <span className="ml-2 text-xs text-mint">{clearedCount} wallet(s) reset to real users.</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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
  const setDemo = useSetDemo();
  const [showCredit, setShowCredit] = useState(false);
  const [showReferrer, setShowReferrer] = useState(false);

  return (
    <div className={`game-panel hud-corner relative rounded-2xl p-4 ${row.isBot ? "opacity-70" : ""}`}>
      {/* Absolute-positioned corner badge — bots ONLY. Bots never show
          the action-buttons row below (see !row.isBot further down),
          so this corner is always free for them. isDemo used to also
          render here, but a demo-flagged wallet is a REAL user and
          DOES show that full button row — the two competed for the
          same corner and visibly overlapped (confirmed live via
          screenshot). isDemo now renders inline in the header instead,
          alongside riskFlag/isKol, where there's no collision. */}
      {row.isBot && (
        <span
          className="absolute right-3 top-3 z-10 rounded-full border border-line bg-panel-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted"
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
            {row.isDemo && (
              <span
                className="rounded-full border border-gold/30 bg-gold-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold"
                title="Admin-flagged demo/marketing account — real wallet, only separated out on this admin page"
              >
                🎭 Demo
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
              onClick={() => setDemo.mutate({ id: row.id, isDemo: !row.isDemo })}
              disabled={setDemo.isPending}
              title="Admin-only classification — has no effect on what this wallet itself sees or can do"
              className="rounded-full border border-gold/40 bg-panel px-2.5 py-1 text-[11px] font-semibold text-gold transition hover:bg-gold-soft disabled:opacity-40"
            >
              {row.isDemo ? "Unmark Demo" : "Mark Demo"}
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
      {/* Every other admin action here (Credit Balance, referrer)
          already shows its own error inline — this one silently had
          none at all, so a failed request looked identical to a
          successful one. Confirmed live as a real gap: "if one user
          demo button click not undemo and not demo work" — with no
          error surfaced, there was no way to tell whether the click
          did nothing or the request failed and why. */}
      {setDemo.error && (
        <p className="mt-1.5 text-[11px] text-risk">
          {setDemo.error instanceof Error ? setDemo.error.message : "Failed to update demo flag."}
        </p>
      )}

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
