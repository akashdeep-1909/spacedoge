"use client";

import { useState } from "react";
import { DataTable } from "@/components/DataTable";
import { useAdminGameProfit, type AdminGameProfitBucket, type AdminGameProfitMatchRow } from "@/lib/hooks";

function fmtUsdt(n: number) {
  return `$${n.toFixed(2)}`;
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
  const { data, isLoading, error } = useAdminGameProfit();
  const [selected, setSelected] = useState<Selection>(null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-black uppercase tracking-wide">Game Profit</h1>
        <p className="mt-1 text-sm text-muted">
          Every settled paid match (Practice and free/prefunded promo modes excluded, demo-flagged wallets
          excluded), grouped by how many real players were in the room — 1 means an instant-play match, always
          1 human against 3 bots. &ldquo;Entries Collected&rdquo; is read straight off the real entry-fee ledger
          debits for that match, not just a theoretical player-count × entry-fee guess; &ldquo;Distributed&rdquo;
          is what real players actually walked away with as PTS (bots never get a real credit even when they
          display a winning rank); &ldquo;Platform Profit&rdquo; is the difference. This is gross, before
          referral commission is paid out of the platform&apos;s own share — it won&apos;t match the Platform
          Treasury balance on the Overview page, which is already net of that. Click any card to see the exact
          matches behind its numbers.
        </p>
      </div>

      {isLoading ? (
        <p className="game-panel hud-corner rounded-2xl p-5 text-sm text-muted">Loading…</p>
      ) : error || !data ? (
        <p className="game-panel hud-corner rounded-2xl p-5 text-sm text-risk">
          {error instanceof Error ? error.message : "Failed to load game profit report."}
        </p>
      ) : (
        <>
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

          {selected !== null && (
            <MatchDrillDown
              title={selected === "total" ? "All Matches" : BUCKET_LABEL[selected] ?? `${selected} Players`}
              matches={selected === "total" ? data.matches : data.matches.filter((m) => m.humanCount === selected)}
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
          Profit: <span className="stat-value text-gold">{fmtUsdt(bucket.profitUsdt)}</span>
        </p>
      </div>
      <p className="mt-2 text-[10px] uppercase tracking-wide text-muted underline">
        {active ? "Hide details" : "View details"}
      </p>
    </button>
  );
}

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
      <DataTable
        columns={["Match ID", "Mode", "Players", "Entry Fee", "Entries Collected", "Distributed", "Profit", "Settled At", "Real Players"]}
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
          <span key="profit" className="text-gold">
            {fmtUsdt(m.profitUsdt)}
          </span>,
          new Date(m.settledAt).toLocaleString(),
          <span key="players" className="text-[11px] text-muted">
            {m.players.join(", ")}
          </span>,
        ])}
      />
    </section>
  );
}
