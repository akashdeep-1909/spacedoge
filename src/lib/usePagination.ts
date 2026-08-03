import { useState } from "react";

export const DEFAULT_PAGE_SIZE = 15;

// One shared paging behavior for every record table in the app — same
// page size, same "clamp to the last valid page if the list shrinks"
// logic, whether the table renders through the generic <DataTable> or
// keeps its own custom row markup (medal icons, highlighted rows, etc).
export function usePagination<T>(items: T[], pageSize = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const clampedPage = Math.min(page, pageCount);
  const start = (clampedPage - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);
  return { pageItems, page: clampedPage, pageCount, setPage, start, pageSize, total: items.length };
}
