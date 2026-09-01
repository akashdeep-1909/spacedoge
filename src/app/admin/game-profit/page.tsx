"use client";

import { useState } from "react";
import { DataTable } from "@/components/DataTable";
import { useAdminGameProfit, type AdminGameProfitBucket, type AdminGameProfitMatchRow, type AdminGameProfitReport } from "@/lib/hooks";

function fmtUsdt(n: number) {
  return `$${n.toFixed(2)}`;
}
function fmtUsdtSigned(n: number) {
  return `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;
}

const BUCKET_LABEL: Record<number, string> = {
  1: "Solo (vs. Bots)",
  2: "2 Players",
  3: "3 Players",
  4: "4 Players",
};

// "total" selects every match regardless of bucket — a 5th virtual
// bucket, not one of the 4 real humanCount values.
type Selection = number | "total" | null;

export default function AdminGameProfitPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data, isLoading, isFetching, error } = useAdminGameProfit(from || undefined, to || undefined);
  const [selected, setSelected] = useState<Selection>(null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-black uppercase tracking-wide">Game Profit</h1>
        <p className="mt-1 text-sm text-muted">
          Every settled paid match (Practice and free/prefunded promo modes excluded, demo-flagged wallets
          excluded), grouped by how many real players were in the room — 1 means an instant-play match, always
          1 human against 3 bots. Entries Collected is read straight off the real entry-fee ledger debits for
          that match, not just a theoretical player-count × entry-fee guess. Distributed is what real players
          actually walked away with as PTS (bots never get a real credit even when they display a winning rank).
          Platform Profit is Entries minus Distributed, before referral commission; Actual Profit also subtracts
          the L1/L2 game-referral commission those same entries funded. Actual Profit still won&apos;t exactly
          match the Platform Treasury balance on the Overview page (that one also folds in Unused Prize Surplus
          from bot-held winning slots, tracked separately there).
        </p>
      </div>

      <DateRangeFilter from={from} to={to} setFrom={setFrom} setTo={setTo} loading={isFetching} />

      {isLoading ? (
        <p className="game-panel hud-corner rounded-2xl p-5 text-sm text-muted">Loading…</p>
      ) : error || !data ? (
        <p className="game-panel hud-corner rounded-2xl p-5 text-sm text-risk">
          {error instanceof Error ? error.message : "Failed to load game profit report."}
        </p>
      ) : (
        <>
          <RevenueSection data={data} />
          <BucketCardsSection data={data} selected={selected} setSelected={setSelected} />
          <ReferralSection data={data} />
          <ProfitSection data={data} />

          {selected !== null && (
            <MatchDrillDown
              title={selected === "total" ? "All Matches" : BUCKET_LABEL[selected] ?? `${selected} Players`}
              matches={selected === "total" ? data.matches : data.matches.filter((m) => m.humanCount === selected)}
              onClose={() => setSelected(null)}
            />
          )}

          <AllMatchesSection data={data} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Date-range filter — narrows the WHOLE page (buckets, referral
// commission, profit, the match table) to matches settled in this
// range. Same component/behavior as Mining Profit's own filter.
// ---------------------------------------------------------------------

function DateRangeFilter({
  from,
  to,
  setFrom,
  setTo,
  loading,
}: {
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  loading: boolean;
}) {
  return (
    <section className="game-panel hud-corner flex flex-wrap items-center gap-3 rounded-2xl p-3">
      <label className="flex items-center gap-2 text-xs text-muted">
        From
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-lg border border-line bg-panel-2 px-2 py-1 text-xs"
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-muted">
        To
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-lg border border-line bg-panel-2 px-2 py-1 text-xs"
        />
      </label>
      {(from || to) && (
        <button
          onClick={() => {
            setFrom("");
            setTo("");
          }}
          className="rounded-full border border-line px-3 py-1 text-[11px] text-muted hover:text-foreground"
        >
          Clear
        </button>
      )}
      {loading && <span className="text-[11px] text-muted">Filtering…</span>}
      <span className="text-[10px] italic text-muted">Filters by when each match settled.</span>
    </section>
  );
}

// ---------------------------------------------------------------------
// Generic tree renderer — same component Mining Profit uses, kept as
// its own copy here (this page has no import boundary with that one)
// for the "A-Z / tree format for easy analysis" convention now shared
// across both profit reports.
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
// Revenue — Entries Collected + Distributed, by player count.
// ---------------------------------------------------------------------

function RevenueSection({ data }: { data: AdminGameProfitReport }) {
  const nodes: TreeRow[] = [
    {
      label: "Total Entries Collected",
      value: fmtUsdt(data.total.entriesUsdt),
      tone: "gold",
      hint: `${data.total.matchCount} match${data.total.matchCount === 1 ? "" : "es"}`,
      children: data.buckets.map((b) => ({
        label: BUCKET_LABEL[b.humanCount] ?? `${b.humanCount} Players`,
        value: fmtUsdt(b.entriesUsdt),
        hint: `${b.matchCount} match${b.matchCount === 1 ? "" : "es"}`,
      })),
    },
    {
      label: "Total Distributed to Players",
      value: fmtUsdt(data.total.distributedUsdt),
      tone: "mint",
      children: data.buckets.map((b) => ({
        label: BUCKET_LABEL[b.humanCount] ?? `${b.humanCount} Players`,
        value: fmtUsdt(b.distributedUsdt),
      })),
    },
  ];
  return <TreeSection title="Revenue &amp; Distribution" nodes={nodes} accent="gold" />;
}

// ---------------------------------------------------------------------
// Referral commission — L1/L2, by player count.
// ---------------------------------------------------------------------

function ReferralSection({ data }: { data: AdminGameProfitReport }) {
  const totalReferral = data.total.referralDirectUsdt + data.total.referralIndirectUsdt;
  const nodes: TreeRow[] = [
    {
      label: "Total Game Referral Commission",
      value: fmtUsdt(totalReferral),
      hint: "L1 (direct) + L2 (indirect), carved out of each match's own entry-fee platform cut",
      children: [
        {
          label: "Direct (L1)",
          value: fmtUsdt(data.total.referralDirectUsdt),
          children: data.buckets
            .filter((b) => b.referralDirectUsdt > 0)
            .map((b) => ({ label: BUCKET_LABEL[b.humanCount] ?? `${b.humanCount} Players`, value: fmtUsdt(b.referralDirectUsdt) })),
        },
        {
          label: "Indirect (L2)",
          value: fmtUsdt(data.total.referralIndirectUsdt),
          children: data.buckets
            .filter((b) => b.referralIndirectUsdt > 0)
            .map((b) => ({ label: BUCKET_LABEL[b.humanCount] ?? `${b.humanCount} Players`, value: fmtUsdt(b.referralIndirectUsdt) })),
        },
      ],
    },
  ];
  return <TreeSection title="Game Referral Commission (L1 / L2)" nodes={nodes} />;
}

// ---------------------------------------------------------------------
// Final profit rollup — Platform Profit (before referral) -> Actual
// Profit (after subtracting L1/L2 referral commission).
// ---------------------------------------------------------------------

function ProfitSection({ data }: { data: AdminGameProfitReport }) {
  const t = data.total;
  const nodes: TreeRow[] = [
    {
      label: "Actual Profit",
      value: fmtUsdtSigned(t.actualProfitUsdt),
      tone: t.actualProfitUsdt >= 0 ? "mint" : "risk",
      children: [
        { label: "Total Entries Collected", value: fmtUsdt(t.entriesUsdt) },
        { label: "− Distributed to Players", value: fmtUsdt(t.distributedUsdt) },
        { label: "= Platform Profit (before referral)", value: fmtUsdt(t.profitUsdt), tone: "gold" },
        { label: "− Referral Commission (L1)", value: fmtUsdt(t.referralDirectUsdt) },
        { label: "− Referral Commission (L2)", value: fmtUsdt(t.referralIndirectUsdt) },
        { label: "= Actual Profit", value: fmtUsdtSigned(t.actualProfitUsdt), tone: t.actualProfitUsdt >= 0 ? "mint" : "risk" },
      ],
    },
  ];
  return (
    <section className="game-panel hud-corner rounded-2xl border-gold/40 p-4">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gold">▸ Platform Profit</p>
      <TreeView nodes={nodes} />
      <p className="mt-3 text-[11px] text-muted">
        Gross, not the same figure as the Platform Treasury balance on the Overview page — Treasury is already
        net of referral commission and also includes Unused Prize Surplus from bot-held winning slots, which
        this per-match report folds into Distributed/Profit instead of separating out.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------
// Player-count bucket cards — click one to drill into its matches.
// ---------------------------------------------------------------------

function BucketCardsSection({
  data,
  selected,
  setSelected,
}: {
  data: AdminGameProfitReport;
  selected: Selection;
  setSelected: (fn: (s: Selection) => Selection) => void;
}) {
  return (
    <section>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gold">▸ By Player Count</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {data.buckets.map((b) => (
          <BucketCard
            key={b.humanCount}
            label={BUCKET_LABEL[b.humanCount] ?? `${b.humanCount} Players`}
            bucket={b}
            active={selected === b.humanCount}
            onClick={() => setSelected((s) => (s === b.humanCount ? null : b.humanCount))}
          />
        ))}
        <BucketCard
          label="Total"
          bucket={{ humanCount: -1, ...data.total }}
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
  bucket: AdminGameProfitBucket;
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
      <p className="mt-1 text-xs text-muted">{bucket.matchCount} match{bucket.matchCount === 1 ? "" : "es"}</p>
      <div className="mt-2 space-y-0.5">
        <p className="text-xs text-muted">
          Entries: <span className="stat-value text-foreground">{fmtUsdt(bucket.entriesUsdt)}</span>
        </p>
        <p className="text-xs text-muted">
          Distributed: <span className="stat-value text-mint">{fmtUsdt(bucket.distributedUsdt)}</span>
        </p>
        <p className="text-xs text-muted">
          Referral L1/L2: <span className="stat-value text-foreground">{fmtUsdt(bucket.referralDirectUsdt)} / {fmtUsdt(bucket.referralIndirectUsdt)}</span>
        </p>
        <p className="text-xs text-muted">
          Actual Profit: <span className="stat-value text-gold">{fmtUsdtSigned(bucket.actualProfitUsdt)}</span>
        </p>
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

function MatchDrillDown({ title, matches, onClose }: { title: string; matches: AdminGameProfitMatchRow[]; onClose: () => void }) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-black uppercase tracking-widest text-muted">
          ▸ {title} <span className="text-foreground">({matches.length})</span>
        </h2>
        <button onClick={onClose} className="rounded-full border border-line px-3 py-1 text-[11px] text-muted hover:text-foreground">
          Close
        </button>
      </div>
      <MatchTable matches={matches} />
    </section>
  );
}

// ---------------------------------------------------------------------
// Full match listing — every qualifying match, with a search field,
// sorted newest-settled-first (default order). Always visible, not
// only on a bucket-card click.
// ---------------------------------------------------------------------

function AllMatchesSection({ data }: { data: AdminGameProfitReport }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? data.matches.filter((m) => m.id.toLowerCase().includes(q) || m.mode.toLowerCase().includes(q) || m.players.some((p) => p.toLowerCase().includes(q)))
    : data.matches;
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-black uppercase tracking-widest text-muted">
          ▸ All Matches <span className="text-foreground">({filtered.length})</span>
        </h2>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search mode, match ID, or player…"
          className="w-full max-w-xs rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-xs"
        />
      </div>
      <MatchTable matches={filtered} />
    </section>
  );
}

function MatchTable({ matches }: { matches: AdminGameProfitMatchRow[] }) {
  return (
    <DataTable
      columns={[
        "Match ID",
        "Mode",
        "Players",
        "Entry Fee",
        "Entries Collected",
        "Distributed",
        "Profit",
        "Referral L1",
        "Referral L2",
        "Actual Profit",
        "Settled At",
        "Real Players",
      ]}
      empty="No matches in this group yet."
      rows={matches.map((m) => [
        <span key="id" className="font-mono text-[11px]">
          {m.id}
        </span>,
        m.mode,
        String(m.humanCount),
        fmtUsdt(m.entryFeeUsdt),
        fmtUsdt(m.entriesUsdt),
        <span key="dist" className="text-mint">
          {fmtUsdt(m.distributedUsdt)}
        </span>,
        fmtUsdt(m.profitUsdt),
        fmtUsdt(m.referralDirectUsdt),
        fmtUsdt(m.referralIndirectUsdt),
        <span key="actual-profit" className="text-gold">
          {fmtUsdtSigned(m.actualProfitUsdt)}
        </span>,
        new Date(m.settledAt).toLocaleString(),
        <span key="players" className="text-[11px] text-muted">
          {m.players.join(", ")}
        </span>,
      ])}
    />
  );
}
