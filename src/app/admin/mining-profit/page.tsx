"use client";

import { useState, type ReactNode } from "react";
import { DataTable } from "@/components/DataTable";
import { RIG_DISPLAY_NAME, MINING_PACKAGES } from "@/lib/mining-shared";
import { useAdminMiningProfit, type AdminMiningProfitBucket, type AdminMiningProfitContractRow, type AdminMiningProfitReport } from "@/lib/hooks";

function fmtUsdt(n: number) {
  return `$${n.toFixed(2)}`;
}
function fmtUsdtSigned(n: number) {
  return `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;
}
function fmtDoge(n: number) {
  return `${n.toFixed(4)} DOGE`;
}
function fmtDogeSigned(n: number) {
  return `${n >= 0 ? "+" : "-"}${Math.abs(n).toFixed(4)} DOGE`;
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
          Full detail on mining revenue, output, referral commission, remaining obligation, and platform profit —
          real users only (demo-flagged wallets excluded) except where noted. Mining output itself is only ever
          paid in DOGE, never USDT directly, so every distribution/output figure below shows DOGE as the primary
          number with its USDT-equivalent valuation alongside it.
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
          <RevenueSection data={data} />
          <BucketCardsSection data={data} selected={selected} setSelected={setSelected} />
          <OutputSection data={data} />
          <ReferralSection data={data} />
          <LiabilitySection data={data} />
          <ProfitSection data={data} />

          {selected !== null && (
            <ContractDrillDown
              title={selected === "total" ? "All Contracts" : levelLabel(selected)}
              contracts={selected === "total" ? data.contracts : data.contracts.filter((c) => c.level === selected)}
              onClose={() => setSelected(null)}
            />
          )}

          <AllContractsSection data={data} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Generic tree renderer — every summary section below is expressed as
// nested TreeRow data and rendered through this one component, per a
// direct request for "A-Z in tree format for easy analysis": each
// section is a root node with its own contributing figures indented
// underneath it, connector lines included, rather than a flat grid of
// unrelated numbers.
// ---------------------------------------------------------------------

interface TreeRow {
  label: string;
  value?: string;
  hint?: string;
  tone?: "gold" | "mint" | "risk";
  children?: TreeRow[];
}

function toneClass(tone?: TreeRow["tone"]) {
  return tone === "gold" ? "text-gold" : tone === "mint" ? "text-mint" : tone === "risk" ? "text-risk" : "text-foreground";
}

function TreeView({ nodes, depth = 0 }: { nodes: TreeRow[]; depth?: number }) {
  return (
    <div className={depth === 0 ? "flex flex-col gap-1" : "ml-3 flex flex-col gap-1 border-l border-line pl-3"}>
      {nodes.map((n, i) => (
        <div key={i}>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-0.5">
            <span className={depth === 0 ? "text-xs font-bold uppercase tracking-wide text-muted" : "text-xs text-muted"}>
              {depth > 0 && "└─ "}
              {n.label}
            </span>
            {n.value !== undefined && <span className={`stat-value text-sm ${toneClass(n.tone)}`}>{n.value}</span>}
            {n.hint && <span className="text-[10px] italic text-muted">{n.hint}</span>}
          </div>
          {n.children && n.children.length > 0 && <TreeView nodes={n.children} depth={depth + 1} />}
        </div>
      ))}
    </div>
  );
}

function TreeSection({ title, nodes, accent }: { title: string; nodes: TreeRow[]; accent?: "gold" }) {
  return (
    <section className={`game-panel hud-corner rounded-2xl p-4 ${accent === "gold" ? "border-gold/25" : ""}`}>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gold">▸ {title}</p>
      <TreeView nodes={nodes} />
    </section>
  );
}

// ---------------------------------------------------------------------
// Revenue — Activation fees + Mining contract sales, contract sales
// broken down by package type.
// ---------------------------------------------------------------------

function RevenueSection({ data }: { data: AdminMiningProfitReport }) {
  const nodes: TreeRow[] = [
    {
      label: "Total Revenue",
      value: fmtUsdt(data.profit.totalRevenueUsdt),
      tone: "gold",
      children: [
        {
          label: "Activation Fees",
          value: fmtUsdt(data.activation.usdt),
          hint: `${data.activation.count} activation${data.activation.count === 1 ? "" : "s"} — $1 flat, unlocks the mining dashboard, grants zero hashrate`,
        },
        {
          label: "Mining Contract Sales",
          value: fmtUsdt(data.total.revenueUsdt),
          hint: `${data.total.contractCount} contract${data.total.contractCount === 1 ? "" : "s"} — every contract runs a fixed ${data.contractPeriodDays}-day term`,
          children: data.buckets.map((b) => ({
            label: levelLabel(b.level),
            value: fmtUsdt(b.revenueUsdt),
            hint: `${b.contractCount} contract${b.contractCount === 1 ? "" : "s"}`,
          })),
        },
      ],
    },
  ];
  return <TreeSection title="Revenue" nodes={nodes} accent="gold" />;
}

// ---------------------------------------------------------------------
// Mining Output — platform-wide daily-settlement waterfall.
// ---------------------------------------------------------------------

function OutputSection({ data }: { data: AdminMiningProfitReport }) {
  const o = data.output;
  // Platform-wide historical average — the same approximation basis
  // every other reconstructed DOGE/USDT figure on this page uses (see
  // the route's own doc-comment). Gross/Pool Fee/Electricity Fee/
  // Reserve Contribution have no per-day rate of their own persisted
  // anywhere queryable, so this is the best available stand-in.
  const rate = data.rates.avgHistoricalDogeUsdt;
  const nodes: TreeRow[] = [
    {
      label: "Gross Mining Output",
      value: `${fmtDoge(o.grossOutputDoge)} (~${fmtUsdt(o.grossOutputDoge * rate)})`,
      hint: "Platform-wide, every real+demo contract combined — not filterable to real users only, see below",
      children: [
        { label: "− Pool Fee", value: `${fmtDoge(o.poolFeeDoge)} (~${fmtUsdt(o.poolFeeDoge * rate)})` },
        {
          label: "− Electricity Fee",
          value: `${fmtDoge(o.electricityFeeDoge)} (~${fmtUsdt(o.electricityFeeDoge * rate)})`,
          hint: "Includes the Mining Referral Commission carve-out shown below",
        },
        {
          label: o.reserveContributionDoge >= 0 ? "− Swept to Protection Reserve" : "+ Drawn from Protection Reserve",
          value: `${fmtDogeSigned(o.reserveContributionDoge)} (~${fmtUsdtSigned(o.reserveContributionDoge * rate)})`,
          hint: o.reserveContributionDoge >= 0 ? "A good-performance day's surplus, banked to smooth future shortfalls" : "A below-target day, funded from the reserve instead of shorting users",
        },
        {
          label: "= Net Distribution to Users",
          value: `${fmtDoge(o.netDistributionDoge)} (~${fmtUsdt(o.netDistributionDoge * rate)}, platform-wide)`,
          tone: "mint",
          hint: `Real users only: ${fmtDoge(data.total.distributedDoge)} (${fmtUsdt(o.netDistributionUsdt)})`,
        },
      ],
    },
  ];
  return (
    <TreeSection title="Mining Output (Platform-Wide Daily Settlement)" nodes={nodes} />
  );
}

// ---------------------------------------------------------------------
// Referral commission — platform-wide, not attributable to a package
// level (see route's own doc-comment).
// ---------------------------------------------------------------------

function ReferralSection({ data }: { data: AdminMiningProfitReport }) {
  const r = data.referral;
  const nodes: TreeRow[] = [
    {
      label: "Total Mining Referral Commission",
      value: `${fmtDoge(r.totalDoge)} (~${fmtUsdt(r.totalUsdtEstimate)})`,
      hint: "Platform-wide — carved out of contracts' own daily electricity-cost deduction, can't be split by package level",
      children: [
        { label: "Direct (L1)", value: fmtDoge(r.directDoge) },
        { label: "Indirect (L2)", value: fmtDoge(r.indirectDoge) },
      ],
    },
  ];
  return <TreeSection title="Mining Referral Commission" nodes={nodes} />;
}

// ---------------------------------------------------------------------
// Liability / Projection — remaining guaranteed payout on currently
// active contracts, by package level.
// ---------------------------------------------------------------------

function LiabilitySection({ data }: { data: AdminMiningProfitReport }) {
  const l = data.liability;
  const nodes: TreeRow[] = [
    {
      label: "Remaining Liability (Active Contracts)",
      value: `${fmtUsdt(l.usdt)} (~${fmtDoge(l.doge)})`,
      tone: "risk",
      hint: `${l.contractCount} contract${l.contractCount === 1 ? "" : "s"} still owed their guaranteed target — DOGE value at today's live rate ($${l.liveRateUsed.toFixed(6)}/DOGE), projecting what the platform would still have to pay if every one of them matured today`,
      children: data.buckets
        .filter((b) => b.liabilityContractCount > 0)
        .map((b) => ({
          label: levelLabel(b.level),
          value: `${fmtUsdt(b.liabilityUsdt)} (~${fmtDoge(b.liabilityDoge)})`,
          hint: `${b.liabilityContractCount} contract${b.liabilityContractCount === 1 ? "" : "s"} still active`,
        })),
    },
  ];
  return <TreeSection title="Liability &amp; Future Payout Projection" nodes={nodes} />;
}

// ---------------------------------------------------------------------
// Final profit rollup.
// ---------------------------------------------------------------------

function ProfitSection({ data }: { data: AdminMiningProfitReport }) {
  const p = data.profit;
  const nodes: TreeRow[] = [
    {
      label: "Platform Profit",
      value: `${fmtUsdt(p.profitUsdt)} (~${fmtDoge(p.profitDoge)})`,
      tone: "gold",
      children: [
        { label: "Total Revenue", value: fmtUsdt(p.totalRevenueUsdt), hint: "Activation + Contract Sales — real USDT paid in, no DOGE component" },
        { label: "− Distributed to Users", value: `${fmtUsdt(p.distributedUsdt)} (${fmtDoge(p.distributedDoge)})` },
        { label: "− Mining Referral Commission (est.)", value: `${fmtUsdt(p.referralUsdtEstimate)} (${fmtDoge(p.referralDoge)})` },
        {
          label: "= Platform Profit",
          value: `${fmtUsdtSigned(p.profitUsdt)} (~${fmtDoge(p.profitDoge)})`,
          tone: p.profitUsdt >= 0 ? "mint" : "risk",
        },
      ],
    },
  ];
  return (
    <section className="game-panel hud-corner rounded-2xl border-gold/40 p-4">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gold">▸ Platform Profit</p>
      <TreeView nodes={nodes} />
      <p className="mt-3 text-[11px] text-muted">
        Doesn&apos;t yet account for the Liability above — profit here reflects what&apos;s happened so far, not
        the remaining guaranteed payout still owed on active contracts. DOGE figures throughout this section use
        the platform-wide historical average rate (${data.rates.avgHistoricalDogeUsdt.toFixed(6)}/DOGE) — Revenue
        itself has no DOGE component (it&apos;s real USDT paid in), only Distributed/Referral/Profit are converted.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------
// Package-level bucket cards — click one to drill into its contracts.
// ---------------------------------------------------------------------

function BucketCardsSection({
  data,
  selected,
  setSelected,
}: {
  data: AdminMiningProfitReport;
  selected: Selection;
  setSelected: (fn: (s: Selection) => Selection) => void;
}) {
  return (
    <section>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gold">▸ By Package Type</p>
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
    </section>
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
          Distributed:{" "}
          <span className="stat-value text-mint">
            {bucket.hasEstimatedDoge && "~"}
            {fmtDoge(bucket.distributedDoge)} <span className="text-muted">({fmtUsdt(bucket.distributedUsdt)})</span>
          </span>
        </p>
        <p className="text-xs text-muted">
          Profit:{" "}
          <span className="stat-value text-gold">
            {fmtUsdt(bucket.profitUsdt)} <span className="text-muted">(~{fmtDoge(bucket.profitDoge)})</span>
          </span>
        </p>
        {bucket.liabilityContractCount > 0 && (
          <p className="text-xs text-muted">
            Liability:{" "}
            <span className="stat-value text-risk">
              {fmtUsdt(bucket.liabilityUsdt)} <span className="text-muted">(~{fmtDoge(bucket.liabilityDoge)})</span>
            </span>
          </p>
        )}
      </div>
      <p className="mt-2 text-[10px] uppercase tracking-wide text-muted underline">
        {active ? "Hide details" : "View details"}
      </p>
    </button>
  );
}

// ---------------------------------------------------------------------
// Drill-down for a clicked bucket card.
// ---------------------------------------------------------------------

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
      <ContractTable contracts={contracts} />
    </section>
  );
}

// ---------------------------------------------------------------------
// Full contract listing — every real-user mining contract, sorted A-Z
// by wallet address by default, per direct request ("A-Z ... for easy
// analysis"). Separate from the per-bucket drill-down above (that one
// only shows when a card is clicked) — this section is always visible.
// ---------------------------------------------------------------------

function AllContractsSection({ data }: { data: AdminMiningProfitReport }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = q ? data.contracts.filter((c) => c.wallet.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)) : data.contracts;
  const sorted = [...filtered].sort((a, b) => a.wallet.localeCompare(b.wallet));
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-black uppercase tracking-widest text-muted">
          ▸ All Contracts, A-Z by Wallet <span className="text-foreground">({sorted.length})</span>
        </h2>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search wallet address, nickname, or contract ID…"
          className="w-full max-w-xs rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-xs"
        />
      </div>
      <ContractTable contracts={sorted} />
    </section>
  );
}

function ContractTable({ contracts }: { contracts: AdminMiningProfitContractRow[] }) {
  return (
    <DataTable
      columns={[
        "Wallet",
        "Level",
        "MH/s",
        "Price Paid",
        "Distributed (DOGE)",
        "Distributed (USDT value)",
        "Profit",
        "Remaining Liability",
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
        <span
          key="dist-doge"
          className="text-mint"
          title={c.distributedDogeIsEstimated ? "Partly estimated — legacy contract predates per-contract DOGE tracking" : undefined}
        >
          {c.distributedDogeIsEstimated && "~"}
          {fmtDoge(c.distributedDoge)}
        </span>,
        fmtUsdt(c.distributedUsdt),
        <span key="profit" className="text-gold">
          {fmtUsdt(c.profitUsdt)} <span className="text-muted">(~{fmtDoge(c.profitDoge)})</span>
        </span>,
        c.remainingLiabilityUsdt > 0 ? (
          <span key="liability" className="text-risk">
            {fmtUsdt(c.remainingLiabilityUsdt)} <span className="text-muted">(~{fmtDoge(c.remainingLiabilityDoge)})</span>
          </span>
        ) : (
          <span key="liability" className="text-muted">
            —
          </span>
        ),
        statusBadge(c),
        new Date(c.startsAt).toLocaleDateString(),
        new Date(c.expiresAt).toLocaleDateString(),
      ])}
    />
  );
}

function statusBadge(c: AdminMiningProfitContractRow): ReactNode {
  if (c.finalShortfallUsdt) return <span className="text-risk">Shortfall {fmtUsdt(c.finalShortfallUsdt)}</span>;
  if (c.reconciled) return <span className="text-mint">Reconciled</span>;
  if (c.active) return <span className="text-gold">Active</span>;
  return <span className="text-muted">Inactive</span>;
}
