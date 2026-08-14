"use client";

import { useState } from "react";
import { PaginationControls } from "@/components/PaginationControls";
import { usePagination } from "@/lib/usePagination";
import { useAdminDeposits, useAssignDeposit, type AdminDepositRow } from "@/lib/hooks";

const STATUS_STYLE: Record<string, string> = {
  CREDITED: "border-mint/25 bg-mint-soft text-mint",
  PENDING: "border-gold/25 bg-gold-soft text-gold",
  UNMATCHED: "border-risk/25 bg-risk-soft text-risk",
};

const FILTERS = ["", "UNMATCHED", "PENDING", "CREDITED"] as const;

// How a deposit row first entered the system — see DepositSource's own
// doc-comment in schema.prisma. WATCHER/AUTO_VERIFY are both "the
// system did it with no one pasting/assigning anything" (styled mint,
// same family as a healthy/no-action-needed state elsewhere in this
// admin); MANUAL_VERIFY/ADMIN_ASSIGN both needed a person to act
// (styled gold, same family this page already uses for "needs
// attention"/in-progress elsewhere). The label spells out WHO/WHAT
// specifically, since "Auto"/"Manual" alone doesn't say whether a user
// or an admin was the one who intervened — the exact distinction that
// prompted adding this tag in the first place.
const SOURCE_STYLE: Record<string, string> = {
  WATCHER: "border-mint/25 bg-mint-soft text-mint",
  AUTO_VERIFY: "border-mint/25 bg-mint-soft text-mint",
  MANUAL_VERIFY: "border-gold/25 bg-gold-soft text-gold",
  ADMIN_ASSIGN: "border-gold/25 bg-gold-soft text-gold",
};
const SOURCE_LABEL: Record<string, string> = {
  WATCHER: "Auto · Watcher",
  AUTO_VERIFY: "Auto · On Deposit",
  MANUAL_VERIFY: "Manual · User Hash",
  ADMIN_ASSIGN: "Manual · Admin",
};

export default function AdminDepositsPage() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("");
  const [txHashInput, setTxHashInput] = useState("");
  const [txHashQuery, setTxHashQuery] = useState("");
  const { data, isLoading } = useAdminDeposits(filter || undefined, txHashQuery || undefined);
  const paged = usePagination(data?.rows ?? []);

  function search() {
    setTxHashQuery(txHashInput.trim());
  }

  function clearSearch() {
    setTxHashInput("");
    setTxHashQuery("");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-black uppercase tracking-wide">Deposits</h1>
        <p className="mt-1 text-sm text-muted">
          Every on-chain deposit seen by the watcher, across every configured chain and all wallets.
        </p>
      </div>

      <div className="game-panel hud-corner rounded-2xl p-4">
        <label className="text-[10px] font-bold uppercase tracking-widest text-muted">
          Verify by Transaction Hash
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            value={txHashInput}
            onChange={(e) => setTxHashInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Paste the 0x… tx hash the user reported"
            className="flex-1 rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-xs"
          />
          <button
            onClick={search}
            disabled={!txHashInput.trim()}
            className="btn-game-outline rounded-full px-4 py-1.5 text-xs disabled:opacity-50"
          >
            Find
          </button>
          {txHashQuery && (
            <button onClick={clearSearch} className="rounded-full border border-line px-4 py-1.5 text-xs text-muted">
              Clear
            </button>
          )}
        </div>
        {txHashQuery && !isLoading && (
          <p className="mt-2 text-[11px] text-muted">
            {data?.rows.length ? `${data.rows.length} match(es) for "${txHashQuery}"` : `No deposit found matching "${txHashQuery}", the watcher may not have picked it up yet, or it wasn't sent to the treasury address.`}
          </p>
        )}
      </div>

      <div className={`flex gap-2 ${txHashQuery ? "pointer-events-none opacity-40" : ""}`}>
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              filter === f ? "border-gold bg-gold-soft text-gold" : "border-line bg-panel text-muted"
            }`}
          >
            {f || "All"}
          </button>
        ))}
      </div>

      <div className="game-panel hud-corner overflow-hidden rounded-2xl">
        {isLoading ? (
          <p className="p-5 text-sm text-muted">Loading…</p>
        ) : !data?.rows.length ? (
          <p className="p-5 text-sm text-muted">No deposits found.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {paged.pageItems.map((row) => (
                <DepositRow key={row.id} row={row} />
              ))}
            </tbody>
          </table>
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

function DepositRow({ row }: { row: AdminDepositRow }) {
  const assign = useAssignDeposit();
  const [assignAddress, setAssignAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const needsReview = row.status !== "CREDITED";

  async function doAssign() {
    setError(null);
    try {
      await assign.mutateAsync({ depositId: row.id, address: assignAddress });
      setAssignAddress("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <tr className="border-b border-line align-top last:border-0">
      <td className="px-4 py-3">
        <div className="flex flex-col items-start gap-1">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLE[row.status]}`}>
            {row.status}
          </span>
          <span
            title={`How this deposit was first found/resolved: ${SOURCE_LABEL[row.source] ?? row.source}`}
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SOURCE_STYLE[row.source] ?? "border-line bg-panel text-muted"}`}
          >
            {SOURCE_LABEL[row.source] ?? row.source}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 font-semibold">
        ${row.amount.toFixed(2)}
        <span className="ml-2 rounded-full border border-line px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted">{row.chain}</span>
      </td>
      <td className="px-4 py-3 text-xs text-muted">
        <p>from: <span className="break-all">{row.fromAddress}</span></p>
        {row.walletAddress && <p className="mt-0.5">wallet: <span className="break-all">{row.walletAddress}</span></p>}
        <p className="mt-0.5">{row.confirmations} conf · {new Date(row.createdAt).toLocaleString()}</p>
        {row.explorerUrl ? (
          <a
            href={row.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 block break-all text-gold underline decoration-dotted underline-offset-2 opacity-90 hover:opacity-100"
          >
            {row.txHash} ↗
          </a>
        ) : (
          <span className="mt-0.5 block break-all">{row.txHash}</span>
        )}
      </td>
      <td className="px-4 py-3">
        {needsReview && (
          <div className="flex flex-col gap-1.5">
            <input
              value={assignAddress}
              onChange={(e) => setAssignAddress(e.target.value)}
              placeholder="wallet address to credit"
              className="w-52 rounded-lg border border-line bg-panel-2 px-2 py-1 text-xs"
            />
            <button
              onClick={doAssign}
              disabled={assign.isPending || !assignAddress}
              className="btn-game-outline rounded-full px-3 py-1 text-xs disabled:opacity-50"
            >
              {assign.isPending ? "Crediting…" : "Assign & Credit"}
            </button>
            {error && <p className="text-[11px] text-risk">{error}</p>}
          </div>
        )}
      </td>
    </tr>
  );
}
