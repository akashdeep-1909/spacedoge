import Link from "next/link";

// Global, platform-wide exports — one section per transaction type,
// every row tagged with the user's ID/wallet address. Plain <a
// download> links to /api/admin/reports/*, not a fetch/mutation: the
// admin session is an httpOnly cookie, so a same-origin navigation to
// these routes already carries it, and each route's own
// Content-Disposition: attachment header does the actual download —
// no client JS needed at all. Per-user exports (scoped to one wallet
// via the same routes' own ?walletId= param) live on that user's own
// detail page instead (src/app/admin/users/[id]/page.tsx), not here.
const REPORTS = [
  { key: "deposits", title: "Deposits", body: "Every on-chain deposit seen by the watcher, across every chain and wallet." },
  { key: "withdrawals", title: "Withdrawals", body: "Every withdrawal request platform-wide, pending and completed." },
  { key: "matches", title: "Game Results (Win / Loss)", body: "Every real (non-bot) match participation — score, rank, and reward." },
  { key: "mining", title: "Mining Contracts", body: "Every mining contract ever purchased, active or expired." },
  { key: "transfers", title: "Internal Transfers", body: "Every user-to-user balance transfer, either side." },
] as const;

export default function AdminReportsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-black uppercase tracking-wide">Reports</h1>
        <p className="mt-1 text-sm text-muted">
          Export every transaction type as CSV or PDF, unbounded (the whole dataset, not just the paginated list
          views elsewhere in this admin panel). Every row is tagged with the user&apos;s wallet ID and address.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {REPORTS.map((r) => (
          <div key={r.key} className="game-panel hud-corner rounded-2xl p-4">
            <h2 className="font-bold">{r.title}</h2>
            <p className="mt-1 text-xs text-muted">{r.body}</p>
            <div className="mt-3 flex gap-2">
              <a
                href={`/api/admin/reports/${r.key}?format=csv`}
                className="btn-game-outline rounded-full px-3 py-1.5 text-xs"
              >
                Export CSV
              </a>
              <a
                href={`/api/admin/reports/${r.key}?format=pdf`}
                className="btn-game-outline rounded-full px-3 py-1.5 text-xs"
              >
                Export PDF
              </a>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted">
        Looking for one specific user&apos;s own report instead? Open their page from{" "}
        <Link href="/admin/users" className="text-gold underline decoration-dotted underline-offset-2">
          Users
        </Link>{" "}
        — every section there has its own scoped CSV/PDF export.
      </p>
    </div>
  );
}
