"use client";

import { useState } from "react";
import {
  useAdminKolVipTiers,
  useCreateAdminKolVipTier,
  useUpdateAdminKolVipTier,
  useAdminKolVipPayouts,
  useAdminSettings,
  useUpdateAdminSettings,
  type AdminKolVipTierRow,
} from "@/lib/hooks";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

const plainInputClass = "w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm";

// bonusPct is stored as at most 4 decimal fraction digits (Decimal(6,4)
// in the schema), so the percentage has at most 2 decimal digits — a
// plain `bonusPct * 100` picks up JS floating-point noise on values
// like 0.07 (renders "7.000000000000001%"). Rounding at the 4th
// fractional digit's own scale (x10000, round, /100) eliminates that
// noise without losing any real precision the field can actually hold.
function pctDisplay(bonusPct: number): number {
  return Math.round(bonusPct * 10000) / 100;
}

// KOL VIP Tiers — a monthly bonus (USDT + mining hashrate) on top of
// the ordinary per-match L1/L2 referral commission, unlocked once a
// wallet's own direct+indirect referral network is active enough in a
// calendar month (src/lib/kolVip.ts). No delete on tiers — same
// "disable, never delete" rule as the Shop editor, since a real
// KolVipPayout row will FK-reference a tier once any month has been
// evaluated against it.
export default function AdminKolVipPage() {
  const { data, isLoading } = useAdminKolVipTiers();
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-black uppercase tracking-wide">KOL VIP Tiers</h1>
        <p className="mt-1 text-sm text-muted">
          A monthly bonus for a wallet&apos;s own referral network, on top of the ordinary per-match
          referral commission (unaffected by this page). Each tier sets a monthly qualified
          DIRECT and INDIRECT referral threshold (a referred wallet counts as &quot;qualified&quot;
          once it plays at least 5 paid matches that month AND has activated mining at least
          once) — a wallet must meet BOTH thresholds to unlock a tier, and gets the highest tier
          it qualifies for, never stacked. The bonus % is the commission rate applied to that
          wallet&apos;s downline&apos;s real platform-profit contribution that month
          (&quot;revenue from referral users&quot;) — the resulting commission is split exactly
          50/50: half paid as Game Reward USDT, half converted to bonus mining hashrate (at the
          platform&apos;s standard MH/s-per-USDT rate) and granted as a new 180-day mining
          contract. Evaluated for the previous completed month, once, the first time anyone loads
          their Referrals page after the month rolls over — there&apos;s no cron in this stack.
        </p>
      </div>

      <KolVipMasterSwitch />

      <section className="game-panel hud-corner rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gold">Tiers</p>
          <button onClick={() => setShowAdd((v) => !v)} className="btn-game-outline shrink-0 rounded-full px-4 py-1.5 text-xs">
            {showAdd ? "Cancel" : "+ Add Tier"}
          </button>
        </div>

        {showAdd && <AddTierForm onDone={() => setShowAdd(false)} />}

        <div className="mt-4 flex flex-col gap-3">
          {isLoading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : !data?.rows.length ? (
            <p className="text-sm text-muted">No tiers yet — add VIP1 to get started.</p>
          ) : (
            data.rows.map((row) => <TierRow key={row.id} row={row} />)
          )}
        </div>
      </section>

      <PayoutsSection />
    </div>
  );
}

function KolVipMasterSwitch() {
  const { data: settings, isLoading } = useAdminSettings();
  const update = useUpdateAdminSettings();
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (!settings) return;
    setError(null);
    try {
      await update.mutateAsync({ kolVipEnabled: !settings.kolVipEnabled });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  const on = settings?.kolVipEnabled ?? false;

  return (
    <section className={`game-panel hud-corner rounded-2xl border-2 p-5 ${on ? "border-mint/30" : "border-risk/40"}`}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gold">KOL VIP Status</p>
          <p className="mt-1 text-sm">
            The whole system is currently <span className={`font-bold ${on ? "text-mint" : "text-risk"}`}>{on ? "ON" : "OFF"}</span>.
          </p>
          <p className="mt-1 text-xs text-muted">
            OFF hides the KOL VIP section on the player Referrals page and skips the monthly
            evaluation entirely — a month that fully elapses while off is never evaluated, even
            if this is turned back on later.
          </p>
        </div>
        <button
          onClick={toggle}
          disabled={isLoading || update.isPending}
          className={`shrink-0 rounded-full px-5 py-2 text-xs font-bold uppercase tracking-wide disabled:opacity-50 ${
            on ? "border border-risk/40 text-risk hover:bg-risk-soft" : "btn-game hud-corner"
          }`}
        >
          {update.isPending ? "Saving…" : on ? "Turn Off" : "Turn On"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-risk">{error}</p>}
    </section>
  );
}

function AddTierForm({ onDone }: { onDone: () => void }) {
  const create = useCreateAdminKolVipTier();
  const [label, setLabel] = useState("");
  const [minDirectReferrals, setMinDirectReferrals] = useState("20");
  const [minIndirectReferrals, setMinIndirectReferrals] = useState("10");
  const [bonusPct, setBonusPct] = useState("1");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!label.trim()) {
      setError("Label is required.");
      return;
    }
    try {
      await create.mutateAsync({
        label: label.trim(),
        minDirectReferrals: Number(minDirectReferrals) || 0,
        minIndirectReferrals: Number(minIndirectReferrals) || 0,
        bonusPct: (Number(bonusPct) || 0) / 100,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tier");
    }
  }

  return (
    <div className="mt-3 grid gap-2 rounded-xl border border-line bg-panel-2 p-3 sm:grid-cols-2">
      <Field label="Label" hint='e.g. "VIP 1"'>
        <input value={label} onChange={(e) => setLabel(e.target.value)} className={plainInputClass} />
      </Field>
      <Field label="Bonus %" hint="commission rate on downline revenue, split 50/50 USDT / hashrate">
        <input type="number" min="0" max="100" step="0.1" value={bonusPct} onChange={(e) => setBonusPct(e.target.value)} className={plainInputClass} />
      </Field>
      <Field label="Monthly qualified DIRECT referrals needed">
        <input type="number" min="0" value={minDirectReferrals} onChange={(e) => setMinDirectReferrals(e.target.value)} className={plainInputClass} />
      </Field>
      <Field label="Monthly qualified INDIRECT referrals needed">
        <input type="number" min="0" value={minIndirectReferrals} onChange={(e) => setMinIndirectReferrals(e.target.value)} className={plainInputClass} />
      </Field>
      <button onClick={submit} disabled={create.isPending} className="btn-game hud-corner rounded-full px-4 py-1.5 text-xs disabled:opacity-50 sm:col-span-2 sm:w-fit">
        {create.isPending ? "Creating…" : "Create Tier"}
      </button>
      {error && <p className="text-xs text-risk sm:col-span-2">{error}</p>}
    </div>
  );
}

function TierRow({ row }: { row: AdminKolVipTierRow }) {
  const update = useUpdateAdminKolVipTier();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(row.label);
  const [minDirectReferrals, setMinDirectReferrals] = useState(String(row.minDirectReferrals));
  const [minIndirectReferrals, setMinIndirectReferrals] = useState(String(row.minIndirectReferrals));
  const [bonusPct, setBonusPct] = useState(String(pctDisplay(row.bonusPct)));
  const [error, setError] = useState<string | null>(null);

  async function toggleEnabled() {
    setError(null);
    try {
      await update.mutateAsync({ id: row.id, enabled: !row.enabled });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function saveEdit() {
    setError(null);
    try {
      await update.mutateAsync({
        id: row.id,
        label: label.trim(),
        minDirectReferrals: Number(minDirectReferrals) || 0,
        minIndirectReferrals: Number(minIndirectReferrals) || 0,
        bonusPct: (Number(bonusPct) || 0) / 100,
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  return (
    <div className="rounded-xl border border-line bg-panel-2 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {row.label}
            <span className="rounded-full border border-line px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted">{row.key}</span>
            {!row.enabled && (
              <span className="rounded-full border border-risk/40 bg-risk-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-risk">
                Disabled
              </span>
            )}
          </p>
          <p className="mt-1 text-xs text-muted">
            {row.minDirectReferrals} direct + {row.minIndirectReferrals} indirect qualified referrals/month · {pctDisplay(row.bonusPct)}% bonus
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button onClick={() => setEditing((v) => !v)} className="rounded-full border border-line px-3 py-1 text-[11px] text-muted hover:text-foreground">
            {editing ? "Cancel" : "Edit"}
          </button>
          <button
            onClick={toggleEnabled}
            disabled={update.isPending}
            className="rounded-full border border-line px-3 py-1 text-[11px] text-muted hover:text-foreground disabled:opacity-50"
          >
            {row.enabled ? "Disable" : "Enable"}
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-2">
          <Field label="Label">
            <input value={label} onChange={(e) => setLabel(e.target.value)} className={plainInputClass} />
          </Field>
          <Field label="Bonus %">
            <input type="number" min="0" max="100" step="0.1" value={bonusPct} onChange={(e) => setBonusPct(e.target.value)} className={plainInputClass} />
          </Field>
          <Field label="Monthly qualified DIRECT referrals needed">
            <input type="number" min="0" value={minDirectReferrals} onChange={(e) => setMinDirectReferrals(e.target.value)} className={plainInputClass} />
          </Field>
          <Field label="Monthly qualified INDIRECT referrals needed">
            <input type="number" min="0" value={minIndirectReferrals} onChange={(e) => setMinIndirectReferrals(e.target.value)} className={plainInputClass} />
          </Field>
          <button onClick={saveEdit} disabled={update.isPending} className="btn-game-outline rounded-full px-4 py-1.5 text-xs disabled:opacity-50 sm:col-span-2 sm:w-fit">
            {update.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-risk">{error}</p>}
    </div>
  );
}

function PayoutsSection() {
  const { data, isLoading } = useAdminKolVipPayouts();

  return (
    <section className="game-panel hud-corner rounded-2xl p-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gold">Recent Payouts</p>
      <p className="mt-1 text-xs text-muted">Every month a wallet actually earned a tier — read-only audit log.</p>
      <div className="mt-3 overflow-x-auto">
        {isLoading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : !data?.rows.length ? (
          <p className="text-sm text-muted">No payouts yet.</p>
        ) : (
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead>
              <tr className="text-muted">
                <th className="pb-2 pr-3 font-bold uppercase tracking-wide">Wallet</th>
                <th className="pb-2 pr-3 font-bold uppercase tracking-wide">Month</th>
                <th className="pb-2 pr-3 font-bold uppercase tracking-wide">Tier</th>
                <th className="pb-2 pr-3 font-bold uppercase tracking-wide">Direct / Indirect</th>
                <th className="pb-2 pr-3 font-bold uppercase tracking-wide">Downline Profit</th>
                <th className="pb-2 pr-3 font-bold uppercase tracking-wide">Total Commission</th>
                <th className="pb-2 pr-3 font-bold uppercase tracking-wide">Bonus USDT (50%)</th>
                <th className="pb-2 font-bold uppercase tracking-wide">Bonus MH/s (50%)</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="py-2 pr-3">{r.nickname || `${r.address.slice(0, 6)}…${r.address.slice(-4)}`}</td>
                  <td className="py-2 pr-3">{r.periodMonth}</td>
                  <td className="py-2 pr-3">{r.tierLabel}</td>
                  <td className="py-2 pr-3">
                    {r.qualifiedDirectCount} / {r.qualifiedIndirectCount}
                  </td>
                  <td className="py-2 pr-3">${r.downlineProfitUsdt.toFixed(2)}</td>
                  <td className="py-2 pr-3">${r.totalCommissionUsdt.toFixed(4)}</td>
                  <td className="py-2 pr-3 font-bold">${r.bonusUsdt.toFixed(4)}</td>
                  <td className="py-2 font-bold">{r.bonusHashrateMhs.toFixed(4)} MH/s</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
