"use client";

import type { ReactNode } from "react";
import { usePagination } from "@/lib/usePagination";
import { PaginationControls } from "@/components/PaginationControls";

// One shared, paginated table for every simple record list in the app
// (History's tabs, the Wallet page's transaction feed, etc.) — same
// page size, same controls, everywhere, so nobody has to scroll
// through a 100+ row table looking for something. Tables with custom
// per-row markup (medal icons, highlighted rows) use `usePagination` +
// `PaginationControls` directly instead of forcing their rows through
// this generic column/row shape — same behavior, their own markup.
export function DataTable({
  columns,
  rows,
  empty,
  pageSize,
}: {
  columns: string[];
  rows: ReactNode[][];
  empty: string;
  // Overrides the shared DEFAULT_PAGE_SIZE (usePagination.ts) for
  // tables that want a smaller/larger page than the app-wide default —
  // e.g. the Transfer page's own history table asks for 10.
  pageSize?: number;
}) {
  const { pageItems, page, pageCount, setPage, start, pageSize: effectivePageSize, total } = usePagination(rows, pageSize);

  if (rows.length === 0) {
    return <p className="text-sm text-muted">{empty}</p>;
  }

  return (
    <div>
      <div className="game-panel hud-corner overflow-x-auto rounded-2xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gold/15 text-left text-[10px] uppercase tracking-widest text-gold">
              {columns.map((c) => (
                <th key={c} className="whitespace-nowrap px-4 py-2.5 font-bold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageItems.map((row, i) => (
              <tr key={start + i} className="border-b border-line last:border-0 hover:bg-panel-2">
                {row.map((cell, j) => (
                  <td key={j} className="stat-value whitespace-nowrap px-4 py-2.5 text-[13px]">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PaginationControls page={page} pageCount={pageCount} start={start} pageSize={effectivePageSize} total={total} onChange={setPage} />
    </div>
  );
}
