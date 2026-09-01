"use client";

import { useState } from "react";
import { DataTable } from "@/components/DataTable";
import { RIG_DISPLAY_NAME, MINING_PACKAGES } from "@/lib/mining-shared";
import { useAdminMiningProfit, type AdminMiningProfitBucket, type AdminMiningProfitContractRow } from "@/lib/hooks";

function fmtUsdt(n: number) {
  return `$${n.toFixed(2)}`;
}
function fmtDoge(n: number) {
  return `${n.toFixed(4)} DOGE`;
}

function levelLabel(level: string) {
  const pkg = MINING_PACKAGES.find((p) => p.level === level);
  const name = RIG_DISPLAY_NAME[level as keyof typeof RIG_DISPLAY_NAME] ?? level;
  return pkg ? `${name} ($${pkg.priceUsdt})` : name;
}

// "total" selects every contract regardless of bucket — a 7th virtual
// bucket, not one of the 6 real MiningLevel values.
type Selection = string | "total" | null;

export default function AdminMiningProfitPage() {
  const { data, isLoading, error } = useAdminMiningProfit();
  const [selected, setSelected] = useState<Selection>(null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-black uppercase tracking-wide">Mining Profit</h1>
        <p className="mt-1 text-sm text-muted">
          Every real mining package purchase (demo-flagged wallets excluded), grouped by package level.
          &ldquo;Revenue Collected&rdquo; is what the wallet paid for that contract (a small number of contracts
          from before purchase debit-tracking existed may not have a matching ledger entry, but still show their
          recorded price here — consistent with how a wallet&apos;s own dashboard ROI card and the Mining page&apos;s
          Contracts table already report it); &ldquo;Distributed&rdquo; is the USDT-equivalent value of every DOGE
          credit that contract has received so far from daily settlement (still climbing for an active contract —
          this isn&apos;t a final number until the contract reconciles at term end); &ldquo;Platform Profit&rdquo;
          is the difference. Mining referral commission is shown separately below, platform-wide in DOGE —
          settlement credits it as one pooled daily amount per referrer across their whole downline, so unlike
          Game Profit&apos;s referral figures it can&apos;t be cleanly split back out by package level. Click any
          card to see the exact contracts behind its numbers.
        </p>
      </div>

      {isLoading ? (
        <p className="game-panel hud-corner rounded-2xl p-5 text-sm text-muted">Loading…</p>
      ) : error || !data ? (
        <p className="game-panel hud-corner rounded-2xl p-5 text-sm text-risk">
          {error instanceof Error ? error.message : "Failed to load mining profit report."}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            {data.buckets.map((b) => (
              <BucketCard
                key={b.level}
                label={levelLabel(b.level)}
                bucket={b}
                active={selected === b.level}
                onClick={() => setSelected((s) => (s === b.level ? null : b.level))}
              />
            ))}
            <BucketCard
              label="Total"
              bucket={{ level: "TOTAL", ...data.total }}
              tone="gold"
              active={selected === "total"}
              onClick={() => setSelected((s) => (s === "total" ? null : "total"))}
            />
          </div>

          <section className="game-panel hud-corner rounded-2xl border-gold/15 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gold">
              Mining Referral Commission (platform-wide, DOGE)
            </p>
            <div className="mt-2 grid grid-cols-2 gap-4 sm:w-96">
              <div>
                <p className="text-xs text-muted">Direct (L1)</p>
                <p className="stat-value text-lg">{fmtDoge(data.referral.directDoge)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Indirect (L2)</p>
                <p className="stat-value text-lg">{fmtDoge(data.referral.indirectDoge)}</p>
              </div>
            </div>
          </section>

          {selected !== null && (
            <ContractDrillDown
              title={selected === "total" ? "All Contracts" : levelLabel(selected)}
              contracts={selected === "total" ? data.contracts : data.contracts.filter((c) => c.level === selected)}
              onClose={() => setSelected(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

function BucketCard({
  label,
  bucket,
  active,
  tone,
  onClick,
}: {
  label: string;
  bucket: AdminMiningProfitBucket;
  active: boolean;
  tone?: "gold";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`game-panel hud-corner rounded-2xl p-4 text-left transition ${
        active ? "border-gold/50 ring-1 ring-gold/40" : tone === "gold" ? "border-gold/25" : ""
      } hover:border-gold/40`}
    >
      <p className={`text-[10px] font-bold uppercase tracking-widest ${tone === "gold" ? "text-gold" : "text-muted"}`}>{label}</p>
      <p className="mt-1 text-xs text-muted">{bucket.contractCount} contract{bucket.contractCount === 1 ? "" : "s"}</p>
      <div className="mt-2 space-y-0.5">
        <p className="text-xs text-muted">
          Revenue: <span className="stat-value text-foreground">{fmtUsdt(bucket.revenueUsdt)}</span>
        </p>
        <p className="text-xs text-muted">
          Distributed: <span className="stat-value text-mint">{fmtUsdt(bucket.distributedUsdt)}</span>
        </p>
        <p className="text-xs text-muted">
          Profit: <span className="stat-value text-gold">{fmtUsdt(bucket.profitUsdt)}</span>
        </p>
      </div>
      <p className="mt-2 text-[10px] uppercase tracking-wide text-muted underline">
        {active ? "Hide details" : "View details"}
      </p>
    </button>
  );
}

function ContractDrillDown({
  title,
  contracts,
  onClose,
}: {
  title: string;
  contracts: AdminMiningProfitContractRow[];
  onClose: () => void;
}) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-black uppercase tracking-widest text-muted">
          ▸ {title} <span className="text-foreground">({contracts.length})</span>
        </h2>
        <button onClick={onClose} className="rounded-full border border-line px-3 py-1 text-[11px] text-muted hover:text-foreground">
          Close
        </button>
      </div>
      <DataTable
        columns={[
          "Wallet",
          "Level",
          "MH/s",
          "Price Paid",
          "Distributed",
          "Profit",
          "Status",
          "Starts",
          "Expires",
        ]}
        empty="No contracts in this group yet."
        rows={contracts.map((c) => [
          <span key="wallet" className="text-[11px]">
            {c.wallet}
          </span>,
          levelLabel(c.level),
          c.miningPower.toFixed(1),
          fmtUsdt(c.priceUsdt),
          <span key="dist" className="text-mint">
            {fmtUsdt(c.distributedUsdt)}
          </span>,
          <span key="profit" className="text-gold">
            {fmtUsdt(c.profitUsdt)}
          </span>,
          c.finalShortfallUsdt
            ? <span key="status" className="text-risk">Shortfall {fmtUsdt(c.finalShortfallUsdt)}</span>
            : c.reconciled
              ? <span key="status" className="text-mint">Reconciled</span>
              : c.active
                ? <span key="status" className="text-gold">Active</span>
                : <span key="status" className="text-muted">Inactive</span>,
          new Date(c.startsAt).toLocaleDateString(),
          new Date(c.expiresAt).toLocaleDateString(),
        ])}
      />
    </section>
  );
}
