"use client";

import { useState } from "react";
import { useAdminLobbies } from "@/lib/hooks";

const STATUS_STYLE: Record<string, string> = {
  WAITING: "border-gold/25 bg-gold-soft text-gold",
  FULL: "border-gold/25 bg-gold-soft text-gold",
  FILLING_AI: "border-gold/25 bg-gold-soft text-gold",
  STARTING: "border-gold/25 bg-gold-soft text-gold",
  STARTED: "border-mint/25 bg-mint-soft text-mint",
  CANCELLED: "border-line bg-panel-2 text-muted",
  EXPIRED: "border-line bg-panel-2 text-muted",
};

const FILTERS = ["", "WAITING", "FULL", "FILLING_AI", "STARTING", "STARTED", "CANCELLED", "EXPIRED"] as const;

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString();
}

function shortAddr(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function AdminLobbiesPage() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("");
  const { data, isLoading } = useAdminLobbies(filter || undefined);

  const activeCount =
    (data?.counts.WAITING ?? 0) + (data?.counts.FULL ?? 0) + (data?.counts.FILLING_AI ?? 0) + (data?.counts.STARTING ?? 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-black uppercase tracking-wide">Play with Friends Lobbies</h1>
        <p className="mt-1 text-sm text-muted">
          Every multiplayer lobby, most recent first. {activeCount} currently active.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              filter === f ? "border-gold bg-gold-soft text-gold" : "border-line bg-panel text-muted"
            }`}
          >
            {f || "All"} {f && data ? `(${data.counts[f] ?? 0})` : ""}
          </button>
        ))}
      </div>

      <div className="game-panel hud-corner overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[10px] font-bold uppercase tracking-widest text-muted">
              <th className="px-4 py-3">Room</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Package</th>
              <th className="px-4 py-3">Host</th>
              <th className="px-4 py-3">Humans</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Match</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && data?.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted">
                  No lobbies yet.
                </td>
              </tr>
            )}
            {data?.rows.map((lobby) => (
              <tr key={lobby.id} className="border-b border-line/50 last:border-0">
                <td className="px-4 py-3 font-mono text-xs">{lobby.roomCode}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLE[lobby.status] ?? ""}`}>
                    {lobby.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {lobby.modeLabel} · {lobby.entryFeeUsdt} USDT
                </td>
                <td className="px-4 py-3 font-mono text-xs">{shortAddr(lobby.hostAddress)}</td>
                <td className="px-4 py-3">{lobby.humanCount}/4</td>
                <td className="px-4 py-3 text-xs text-muted">{fmtDateTime(lobby.createdAt)}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted">{lobby.finalMatchId ? lobby.finalMatchId.slice(0, 10) + "…" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
