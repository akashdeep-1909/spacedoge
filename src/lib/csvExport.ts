// Minimal RFC 4180 CSV escaping/building — the exact pattern
// src/app/api/admin/waitlist/export/route.ts (the one export endpoint
// that already existed) established, pulled out here so every other
// admin export route (deposits, withdrawals, game results, mining
// contracts, and the combined per-user report) shares one
// implementation instead of re-copying the escaping logic per route.
export function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function buildCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = rows.map((row) => row.map((cell) => csvField(String(cell))).join(","));
  return [headers.map(csvField).join(","), ...lines].join("\n") + "\n";
}
