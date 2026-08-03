"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export function PaginationControls({
  page,
  pageCount,
  start,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageCount: number;
  start: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-xs">
      <p className="text-muted">
        Showing {start + 1}–{Math.min(start + pageSize, total)} of {total}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          aria-label="Previous page"
          className="btn-game-outline grid h-8 w-8 place-items-center rounded-full disabled:opacity-30"
        >
          <ChevronLeft size={15} />
        </button>
        <p className="font-bold tabular-nums text-foreground">
          {page} / {pageCount}
        </p>
        <button
          type="button"
          onClick={() => onChange(Math.min(pageCount, page + 1))}
          disabled={page >= pageCount}
          aria-label="Next page"
          className="btn-game-outline grid h-8 w-8 place-items-center rounded-full disabled:opacity-30"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
