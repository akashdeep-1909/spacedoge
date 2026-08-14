"use client";

import { useState } from "react";
import { DataTable } from "@/components/DataTable";
import { useAdminWaitlist } from "@/lib/hooks";

export default function AdminWaitlistPage() {
  const [query, setQuery] = useState("");
  const { data, isLoading } = useAdminWaitlist(query);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-black uppercase tracking-wide">Waitlist</h1>
          <p className="mt-1 text-sm text-muted">
            {data ? `${data.totalCount} signup${data.totalCount === 1 ? "" : "s"} total. ` : ""}
            Every &quot;Join Waitlist&quot; popup submission from the marketing pages.
          </p>
        </div>
        <a
          href="/api/admin/waitlist/export"
          className="btn-game hud-corner shrink-0 rounded-full px-4 py-2 text-xs"
        >
          Export CSV
        </a>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search email…"
        className="w-full max-w-sm rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm"
      />

      {isLoading ? (
        <p className="game-panel hud-corner rounded-2xl p-5 text-sm text-muted">Loading…</p>
      ) : (
        <DataTable
          columns={["Email", "Source", "Joined"]}
          empty="No waitlist signups yet."
          rows={(data?.rows ?? []).map((r) => [
            r.email,
            r.source ?? "-",
            new Date(r.createdAt).toLocaleString(),
          ])}
        />
      )}
    </div>
  );
}
