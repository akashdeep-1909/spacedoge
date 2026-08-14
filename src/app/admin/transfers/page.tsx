"use client";

import { useState } from "react";
import { PaginationControls } from "@/components/PaginationControls";
import { usePagination } from "@/lib/usePagination";
import { useAdminTransfers, type AdminTransferRow } from "@/lib/hooks";
import { balanceTypeLabel } from "@/lib/balance-labels";
import { useLocale } from "@/lib/i18n/LocaleProvider";

function shortenAddress(address: string): string {
  return address.length > 10 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}

export default function AdminTransfersPage() {
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const { data, isLoading } = useAdminTransfers(query || undefined);
  const paged = usePagination(data?.rows ?? []);

  function search() {
    setQuery(queryInput.trim());
  }

  function clearSearch() {
    setQueryInput("");
    setQuery("");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-black uppercase tracking-wide">Transfers</h1>
        <p className="mt-1 text-sm text-muted">
          Every user-to-user wallet transfer (Recycled/Referral USDT sent directly between two different
          accounts), the one real-money channel between different users this app has, separate from the
          same-wallet balance moves shown in a wallet's own ledger.
        </p>
      </div>

      <div className="game-panel hud-corner rounded-2xl p-4">
        <label className="text-[10px] font-bold uppercase tracking-widest text-muted">
          Search by Address or Nickname
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="0x… or nickname, either side of the transfer"
            className="flex-1 rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-xs"
          />
          <button
            onClick={search}
            disabled={!queryInput.trim()}
            className="btn-game-outline rounded-full px-4 py-1.5 text-xs disabled:opacity-50"
          >
            Find
          </button>
          {query && (
            <button onClick={clearSearch} className="rounded-full border border-line px-4 py-1.5 text-xs text-muted">
              Clear
            </button>
          )}
        </div>
        {query && !isLoading && (
          <p className="mt-2 text-[11px] text-muted">
            {data?.rows.length ? `${data.rows.length} match(es) for "${query}"` : `No transfer found matching "${query}".`}
          </p>
        )}
      </div>

      <div className="game-panel hud-corner overflow-hidden rounded-2xl">
        {isLoading ? (
          <p className="p-5 text-sm text-muted">Loading…</p>
        ) : !data?.rows.length ? (
          <p className="p-5 text-sm text-muted">No user-to-user transfers yet.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {paged.pageItems.map((row) => (
                <TransferRow key={row.id} row={row} />
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

function TransferRow({ row }: { row: AdminTransferRow }) {
  const { t } = useLocale();
  return (
    <tr className="border-b border-line align-top last:border-0">
      <td className="px-4 py-3 font-semibold">
        ${row.amount.toFixed(2)}
        <span className="ml-2 rounded-full border border-line px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted">
          {balanceTypeLabel(t, row.balanceType)}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-muted">
        <p>
          from: <span className="break-all">{row.fromNickname || shortenAddress(row.fromAddress)}</span>
        </p>
        <p className="mt-0.5">
          to: <span className="break-all">{row.toNickname || shortenAddress(row.toAddress)}</span>
        </p>
        {row.note && <p className="mt-0.5 italic">"{row.note}"</p>}
        <p className="mt-0.5">{new Date(row.createdAt).toLocaleString()}</p>
      </td>
    </tr>
  );
}
