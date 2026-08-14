"use client";

import { useEffect, useRef, useState } from "react";
import { DataTable } from "@/components/DataTable";
import { MHS_PER_RIG, levelDisplayNameWithPlus } from "@/lib/mining-shared";
import {
  useAdminMiningEconomics,
  useUpdateMiningEconomics,
  useAdminMiningReserve,
  useTopUpMiningReserve,
  useAdminMiningContracts,
  useAdminMiningEconomicsReport,
  type AdminMiningEconomicsConfig,
} from "@/lib/hooks";

function fmtUsdt(n: number) {
  return `$${n.toFixed(2)}`;
}

export default function AdminMiningPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-black uppercase tracking-wide">Mining</h1>
        <p className="mt-1 text-sm text-muted">
          Mining v2 economy model, fleet economics, the Protection Reserve that smooths every
          contract&apos;s daily reward to its guaranteed target ROI, individual contracts, and a
          read-only platform revenue report. Changes take effect immediately, no redeploy needed.
        </p>
      </div>

      <HealthBanner />
      <RigFleetSection />
      <FleetEconomicsSection />
      <ProtectionReserveSection />
      <ContractsSection />
      <PlatformEconomicsSection />
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

const inputClass = "w-full rounded-lg border border-line bg-panel-2 px-3 py-2 font-mono text-sm";

// ---------------------------------------------------------------------
// Health banner — doc section 11's profitability floor + reserve
// balance, purely informational except for the manual newContractsPaused
// kill-switch (deliberately not automatic — see src/lib/mining-settings.ts
// getMiningHealthStatus's doc-comment for why).
// ---------------------------------------------------------------------

function HealthBanner() {
  const { data: config } = useAdminMiningEconomics();
  const { data: reserve } = useAdminMiningReserve();
  const update = useUpdateMiningEconomics();

  if (!config || !reserve) {
    return (
      <section className="game-panel hud-corner rounded-2xl p-5">
        <p className="text-sm text-muted">Loading…</p>
      </section>
    );
  }

  const belowThreshold = config.referenceMonthlyGrossUsdt < config.profitabilityThresholdUsdt;
  const reserveLow = config.reserveLowBalanceThresholdUsdt !== null && reserve.balanceUsdt < config.reserveLowBalanceThresholdUsdt;

  return (
    <section className="game-panel hud-corner rounded-2xl border-gold/15 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${
              belowThreshold ? "border-risk/40 bg-risk-soft text-risk" : "border-mint/25 bg-mint-soft text-mint"
            }`}
          >
            {belowThreshold ? "Below profitability threshold" : "Above profitability threshold"}
          </span>
          <span className="text-xs text-muted">
            Reference gross {fmtUsdt(config.referenceMonthlyGrossUsdt)}/mo vs. {fmtUsdt(config.profitabilityThresholdUsdt)} floor
          </span>
          {reserveLow && (
            <span className="rounded-full border border-risk/40 bg-risk-soft px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-risk">
              Reserve low
            </span>
          )}
        </div>
        <button
          onClick={() => update.mutate({ newContractsPaused: !config.newContractsPaused })}
          disabled={update.isPending}
          className={`rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-wide disabled:opacity-50 ${
            config.newContractsPaused ? "border-mint/40 bg-mint-soft text-mint" : "border-risk/40 bg-risk-soft text-risk"
          }`}
        >
          {config.newContractsPaused ? "Resume new contracts" : "Pause new contracts"}
        </button>
      </div>
      {config.newContractsPaused && (
        <p className="mt-2 text-xs text-risk">
          New mining contracts are currently paused (POST /api/mining/purchase-power returns 403). Existing contracts are unaffected.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------
// Fleet Economics — every MiningEconomicsConfig field. New contracts
// snapshot targetRoiPct at purchase time, so changing it here only
// ever affects contracts sold from this point forward.
// ---------------------------------------------------------------------

type NumericConfigKey = Exclude<keyof AdminMiningEconomicsConfig, "reserveLowBalanceThresholdUsdt" | "newContractsPaused" | "updatedAt" | "updatedByAddress">;

const FLEET_FIELDS: { key: NumericConfigKey; label: string; step: string; hint?: string }[] = [
  { key: "referenceMonthlyGrossUsdt", label: "Reference monthly gross (USDT)", step: "0.01", hint: "Full-fleet-utilization gross income per month" },
  { key: "minerPowerKw", label: "Miner power draw (kW)", step: "0.01" },
  { key: "electricityRateUsdtPerKwh", label: "Electricity rate (USDT/kWh)", step: "0.001", hint: "User-facing deduction rate" },
  { key: "hostingElectricityRateUsdtPerKwh", label: "Hosting/cooling rate (USDT/kWh)", step: "0.001", hint: "Platform-internal, report-only, doc section 13" },
  { key: "poolFeePct", label: "Pool fee (fraction, e.g. 0.02 = 2%)", step: "0.0001" },
  { key: "targetRoiPct", label: "Target ROI (fraction, e.g. 0.10 = 10%)", step: "0.0001", hint: "Snapshotted onto new contracts at purchase time" },
  { key: "dailyVarianceBandPct", label: "Daily variance band (fraction)", step: "0.01", hint: "e.g. 0.10 = ±10% around the reference rate" },
  { key: "platformProfitAllocationPct", label: "Platform profit allocation (fraction)", step: "0.01", hint: "Doc section 13, report-only" },
  { key: "profitabilityThresholdUsdt", label: "Profitability threshold (USDT/mo)", step: "0.01" },
];

// ---------------------------------------------------------------------
// ASIC Rig Fleet — a dedicated control for MiningEconomicsConfig.
// fleetCapacityMhs, expressed as a whole rig count (1 rig = MHS_PER_RIG
// = 16 GH/s) rather than a raw MH/s number, per the product's own rig-
// based framing (see the public /pool page, which shows the same unit).
// Split out from the generic FLEET_FIELDS list below because adding/
// removing physical rigs is its own action an admin takes independently
// of tuning the economics formula — a dedicated +/- stepper plus a
// direct rig-count input, saved immediately, rather than bundled into
// the "Save Fleet Economics" button for every other field.
// ---------------------------------------------------------------------

function RigFleetSection() {
  const { data } = useAdminMiningEconomics();
  const update = useUpdateMiningEconomics();
  const [rigInput, setRigInput] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialized = useRef(false);
  useEffect(() => {
    if (!data || initialized.current) return;
    initialized.current = true;
    setRigInput(String(Math.round(data.fleetCapacityMhs / MHS_PER_RIG)));
  }, [data]);

  if (!data) {
    return (
      <section className="game-panel hud-corner rounded-2xl p-5">
        <p className="text-sm text-muted">Loading…</p>
      </section>
    );
  }

  const currentRigs = Math.round(data.fleetCapacityMhs / MHS_PER_RIG);

  async function saveRigs(nextRigs: number) {
    const clamped = Math.max(0, Math.round(nextRigs));
    setRigInput(String(clamped));
    setError(null);
    setSaved(false);
    try {
      await update.mutateAsync({ fleetCapacityMhs: clamped * MHS_PER_RIG });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  return (
    <section className="game-panel hud-corner rounded-2xl p-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gold">ASIC Rig Fleet</p>
      <p className="mt-1 text-xs text-muted">
        Total physical rig count the platform&apos;s sellable hashrate is modeled against, one rig ={" "}
        {MHS_PER_RIG.toLocaleString()} MH/s ({(MHS_PER_RIG / 1000).toFixed(0)} GH/s). Only a portion of
        this fleet is typically under contract to users at any time, the public pool page shows both
        numbers; the rest is uncontracted headroom.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => saveRigs(currentRigs - 1)}
          disabled={update.isPending || currentRigs <= 0}
          aria-label="Remove one rig"
          className="btn-game-outline grid h-9 w-9 place-items-center rounded-full text-base disabled:opacity-40"
        >
          −
        </button>
        <input
          type="number"
          step="1"
          min="0"
          value={rigInput}
          onChange={(e) => setRigInput(e.target.value)}
          className={`${inputClass} w-28 text-center`}
        />
        <button
          type="button"
          onClick={() => saveRigs(currentRigs + 1)}
          disabled={update.isPending}
          aria-label="Add one rig"
          className="btn-game-outline grid h-9 w-9 place-items-center rounded-full text-base disabled:opacity-40"
        >
          +
        </button>
        <span className="text-xs text-muted">
          rigs ({((currentRigs * MHS_PER_RIG) / 1000).toLocaleString()} GH/s total)
        </span>
        <button
          type="button"
          onClick={() => saveRigs(Number(rigInput))}
          disabled={update.isPending}
          className="btn-game-outline rounded-full px-4 py-1.5 text-xs disabled:opacity-50"
        >
          {update.isPending ? "Saving…" : "Set Rig Count"}
        </button>
        {saved && !update.isPending && <span className="text-xs text-mint">✓ Saved</span>}
        {error && <span className="text-xs text-risk">{error}</span>}
      </div>
    </section>
  );
}

function FleetEconomicsSection() {
  const { data, isLoading } = useAdminMiningEconomics();
  const update = useUpdateMiningEconomics();

  const [values, setValues] = useState<Record<string, string>>({});
  const [reserveLowThreshold, setReserveLowThreshold] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialized = useRef(false);
  useEffect(() => {
    if (!data || initialized.current) return;
    initialized.current = true;
    const next: Record<string, string> = {};
    for (const f of FLEET_FIELDS) next[f.key] = String(data[f.key]);
    setValues(next);
    setReserveLowThreshold(data.reserveLowBalanceThresholdUsdt !== null ? String(data.reserveLowBalanceThresholdUsdt) : "");
  }, [data]);

  async function save() {
    setError(null);
    setSaved(false);
    try {
      const patch: Partial<AdminMiningEconomicsConfig> = {
        reserveLowBalanceThresholdUsdt: reserveLowThreshold.trim() ? Number(reserveLowThreshold) : null,
      };
      for (const f of FLEET_FIELDS) {
        const raw = values[f.key];
        if (raw !== undefined && raw.trim() !== "") (patch as Record<string, number>)[f.key] = Number(raw);
      }
      await update.mutateAsync(patch);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  if (isLoading || !data) {
    return (
      <section className="game-panel hud-corner rounded-2xl p-5">
        <p className="text-sm text-muted">Loading…</p>
      </section>
    );
  }

  return (
    <section className="game-panel hud-corner rounded-2xl p-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gold">Fleet Economics</p>
      <p className="mt-1 text-xs text-muted">
        The reference-fleet numbers every daily settlement scales from (src/lib/mining.ts
        settleEpochForDate). Explicitly labeled &quot;model assumptions&quot;, see the doc&apos;s own footnote
        on the pool fee and electricity rate.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {FLEET_FIELDS.map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint}>
            <input
              type="number"
              step={f.step}
              value={values[f.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className={inputClass}
            />
          </Field>
        ))}
        <Field label="Reserve low-balance warning (USDT)" hint="Blank = no warning shown">
          <input
            type="number"
            step="0.01"
            value={reserveLowThreshold}
            onChange={(e) => setReserveLowThreshold(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} disabled={update.isPending} className="btn-game-outline rounded-full px-4 py-1.5 text-xs disabled:opacity-50">
          {update.isPending ? "Saving…" : "Save Fleet Economics"}
        </button>
        {saved && !update.isPending && <span className="text-xs text-mint">✓ Saved</span>}
        {error && <span className="text-xs text-risk">{error}</span>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------
// Protection Reserve — current balance + manual top-up. Automatic
// inflow (daily organic surplus) and outflow (daily/expiry shortfall
// draws) happen inside settleEpochForDate/reconcileExpiredContracts;
// this is only the admin-initiated seed/top-up path.
// ---------------------------------------------------------------------

function ProtectionReserveSection() {
  const { data, isLoading } = useAdminMiningReserve();
  const topUp = useTopUpMiningReserve();

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  async function doTopUp() {
    setFeedback(null);
    try {
      await topUp.mutateAsync({ amountUsdt: Number(amount), note: note.trim() || undefined });
      setFeedback("Reserve topped up.");
      setAmount("");
      setNote("");
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Top-up failed");
    }
  }

  return (
    <section className="game-panel hud-corner rounded-2xl border-mint/15 p-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-mint">Protection Reserve</p>
      <p className="mt-1 text-xs text-muted">
        Smooths every contract&apos;s daily credited reward to its guaranteed target, surplus days
        sweep in automatically, shortfall days draw from here (capped by balance). Doc section 12
        recommends 96–128 USDT seeded per L9 six-month cohort.
      </p>

      <p className="stat-value text-glow-mint mt-3 text-3xl text-mint">
        {isLoading || !data ? "…" : fmtUsdt(data.balanceUsdt)}
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Field label="Top-up amount (USDT)">
          <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputClass} w-40`} />
        </Field>
        <Field label="Note (optional)">
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className={`${inputClass} w-56`} />
        </Field>
        <button
          onClick={doTopUp}
          disabled={topUp.isPending || !amount || Number(amount) <= 0}
          className="btn-game-outline rounded-full px-4 py-1.5 text-xs disabled:opacity-50"
        >
          {topUp.isPending ? "Topping up…" : "Top Up Reserve"}
        </button>
        {feedback && <span className={`text-xs ${feedback === "Reserve topped up." ? "text-mint" : "text-risk"}`}>{feedback}</span>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------
// Contracts — every MiningContract, most recent first.
// ---------------------------------------------------------------------

function ContractsSection() {
  const { data, isLoading } = useAdminMiningContracts();

  return (
    <section>
      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gold">Contracts</p>
      {isLoading ? (
        <p className="game-panel hud-corner rounded-2xl p-5 text-sm text-muted">Loading…</p>
      ) : (
        <DataTable
          columns={["Wallet", "Level", "MH/s", "Price", "Target ROI", "Credited", "Term", "Expires", "Status"]}
          empty="No mining contracts yet."
          rows={(data?.rows ?? []).map((r) => [
            r.walletNickname || `${r.walletAddress.slice(0, 6)}…${r.walletAddress.slice(-4)}`,
            levelDisplayNameWithPlus(r.level, r.miningPower),
            r.miningPower.toFixed(1),
            fmtUsdt(r.pricePaidUsdt),
            `${(r.targetRoiPct * 100).toFixed(0)}%`,
            fmtUsdt(r.cumulativeCreditedUsdtEquiv),
            `${r.termDays}d`,
            new Date(r.expiresAt).toLocaleDateString(),
            r.reconciledAt
              ? r.finalShortfallUsdt
                ? <span key="status" className="text-risk">Shortfall {fmtUsdt(r.finalShortfallUsdt)}</span>
                : <span key="status" className="text-mint">Reconciled</span>
              : r.active
                ? <span key="status" className="text-gold">Active</span>
                : <span key="status" className="text-muted">Inactive</span>,
          ])}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------
// Platform Economics — doc section 13's read-only revenue report.
// ---------------------------------------------------------------------

function PlatformEconomicsSection() {
  const { data, isLoading } = useAdminMiningEconomicsReport(30);

  return (
    <section className="game-panel hud-corner rounded-2xl p-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gold">Platform Economics (last {data?.days ?? 30} days)</p>
      <p className="mt-1 text-xs text-muted">
        Read-only, derived from package sales and settlement ledger entries, never posts
        anything itself. &quot;Maintenance reserve&quot; and &quot;hardware-recovery reserve&quot; are collapsed into
        one residual bucket here (see the route&apos;s own doc-comment for why).
      </p>

      {isLoading || !data ? (
        <p className="mt-3 text-sm text-muted">Loading…</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-panel-2 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Package sales revenue</p>
            <p className="stat-value mt-1 text-lg">{fmtUsdt(data.packageSalesRevenueUsdt)}</p>
          </div>
          <div className="rounded-xl border border-line bg-panel-2 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Service/variance surplus</p>
            <p className="stat-value mt-1 text-lg">{fmtUsdt(data.serviceVarianceSurplusUsdt)}</p>
          </div>
          <div className="rounded-xl border border-mint/25 bg-mint-soft p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-mint">Total mining revenue</p>
            <p className="stat-value mt-1 text-lg text-mint">{fmtUsdt(data.totalMiningRevenueUsdt)}</p>
          </div>
          <div className="rounded-xl border border-line bg-panel-2 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Hosting/cooling cost</p>
            <p className="stat-value mt-1 text-lg">{fmtUsdt(data.hostingCoolingCostUsdt)}</p>
          </div>
          <div className="rounded-xl border border-line bg-panel-2 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Platform profit allocation</p>
            <p className="stat-value mt-1 text-lg">{fmtUsdt(data.platformProfitAllocationUsdt)}</p>
          </div>
          <div className="rounded-xl border border-line bg-panel-2 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Hardware-recovery reserve</p>
            <p className="stat-value mt-1 text-lg">{fmtUsdt(data.hardwareRecoveryReserveUsdt)}</p>
          </div>
        </div>
      )}
    </section>
  );
}
