"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "@/components/ChartTooltip";
import { CompositionBar } from "@/components/CompositionBar";
import { CHART } from "@/lib/chart-theme";
import { useAdminOverview, type AdminOverview } from "@/lib/hooks";

function fmtUsdt(n: number) {
  return `$${n.toFixed(2)}`;
}
function fmtUsdtShort(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

const RANGES = [7, 30, 90] as const;

const DEPOSIT_STATUS_STYLE: Record<string, string> = {
  UNMATCHED: "border-risk/25 bg-risk-soft text-risk",
  PENDING: "border-gold/25 bg-gold-soft text-gold",
  CREDITED: "border-mint/25 bg-mint-soft text-mint",
};
const WITHDRAWAL_STATUS_STYLE: Record<string, string> = {
  PENDING: "border-gold/25 bg-gold-soft text-gold",
  COMPLETED: "border-mint/25 bg-mint-soft text-mint",
};

export default function AdminOverviewPage() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const { data, isLoading } = useAdminOverview(days);

  if (isLoading || !data) {
    return <p className="text-sm text-muted">Loading…</p>;
  }

  const needsReview = data.deposits.totals.unmatched.count;
  const pendingWithdrawals = data.withdrawals.totals.pending;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-black uppercase tracking-wide">Platform Overview</h1>
          <p className="mt-1 text-sm text-muted">
            {data.walletCount} wallets ({data.newWallets} new in range) · {data.matchCount} matches played
          </p>
        </div>
        <div className="flex gap-1 rounded-full border border-line bg-panel p-1 text-xs font-semibold">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setDays(r)}
              className={`rounded-full px-3 py-1.5 transition ${
                days === r ? "bg-gold-soft text-gold" : "text-muted hover:text-foreground"
              }`}
            >
              {r}D
            </button>
          ))}
        </div>
      </div>

      {/* --- KPI row --------------------------------------------------- */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Available Balance" value={fmtUsdt(data.availableUsdt)} tone="mint" />
        <StatCard
          label="Pending Withdrawals"
          value={`${pendingWithdrawals.count} · ${fmtUsdt(pendingWithdrawals.amount)}`}
          tone={pendingWithdrawals.count > 0 ? "gold" : undefined}
        />
        <StatCard
          label="Deposits Needing Review"
          value={`${needsReview} · ${fmtUsdt(data.deposits.totals.unmatched.amount)}`}
          tone={needsReview > 0 ? "risk" : undefined}
        />
        <StatCard label="Fees Collected (lifetime)" value={fmtUsdt(data.withdrawals.feesCollected)} />
        <StatCard label="Platform Treasury" value={fmtUsdt(data.balances.treasuryUsdt)} tone="gold" />
        <StatCard label="New Wallets" value={String(data.newWallets)} />
        <StatCard label="Matches Played" value={String(data.matchCount)} />
        <StatCard label="Active Lobbies" value={String(data.activeLobbyCount)} />
        <StatCard label="Unused Prize Surplus" value={fmtUsdt(data.matchUnusedPrizeSurplusUsdt)} />
      </section>

      {/* --- Balance composition ---------------------------------------- */}
      <section>
        <h2 className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-gold">▸ Balance Composition</h2>
        <div className="game-panel hud-corner rounded-2xl p-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">USDT balances</p>
          <CompositionBar
            formatValue={(n) => fmtUsdt(n)}
            segments={[
              { label: "Deposit USDT", value: data.balances.playUsdt, color: CHART.mint },
              { label: "Game Reward USDT", value: data.balances.gameRewardUsdt, color: CHART.gold },
              { label: "Mining Earnings", value: data.balances.recycledUsdt, color: CHART.violet },
              { label: "Referral USDT", value: data.balances.referralUsdt, color: CHART.muted },
            ]}
          />
          <div className="mt-4 grid grid-cols-3 gap-3">
            <StatCard label="PTS (raw points)" value={data.balances.pts.toFixed(0)} />
            <StatCard label="Pending DOGE" value={data.balances.pendingDoge.toFixed(4)} />
            <StatCard label="Available DOGE" value={data.balances.availableDoge.toFixed(4)} tone="mint" />
          </div>
        </div>
      </section>

      <DepositsSection data={data} />
      <WithdrawalsSection data={data} />

      {/* --- Mining ------------------------------------------------------ */}
      <section>
        <h2 className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-gold">▸ Mining</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Active Mining Power" value={`${data.mining.activeMiningPower.toFixed(1)} MH/s`} />
          <StatCard label="Active Contracts" value={String(data.mining.activeContracts)} />
          <StatCard
            label="Latest Epoch Output"
            value={data.mining.latestEpoch ? `${data.mining.latestEpoch.netDistributableDoge.toFixed(4)} DOGE` : "-"}
            tone="mint"
          />
          <StatCard label="Protection Reserve" value={`$${data.mining.reserveBalanceUsdt.toFixed(2)}`} tone="gold" />
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "mint" | "risk" | "gold" }) {
  const toneClass =
    tone === "mint" ? "border-mint/25 text-mint" : tone === "risk" ? "border-risk/25 text-risk" : tone === "gold" ? "border-gold/25 text-gold" : "";
  return (
    <div className={`game-panel hud-corner rounded-2xl p-4 ${toneClass}`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{label}</p>
      <p className="stat-value mt-1.5 text-lg">{value}</p>
    </div>
  );
}

const DEPOSIT_FILTERS = ["All", "UNMATCHED", "PENDING", "CREDITED"] as const;

function DepositsSection({ data }: { data: AdminOverview }) {
  const [filter, setFilter] = useState<(typeof DEPOSIT_FILTERS)[number]>("All");
  const { unmatched, pending, credited } = data.deposits.totals;

  const recent = useMemo(
    () => (filter === "All" ? data.deposits.recent : data.deposits.recent.filter((d) => d.status === filter)),
    [data.deposits.recent, filter]
  );

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gold">▸ Deposits</h2>
        <div className="flex flex-wrap gap-2">
          {DEPOSIT_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                filter === f ? "border-gold bg-gold-soft text-gold" : "border-line bg-panel text-muted"
              }`}
            >
              {f === "All" ? "All" : f[0] + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Unmatched" value={`${unmatched.count} · ${fmtUsdt(unmatched.amount)}`} tone="risk" />
        <StatCard label="Pending confirmations" value={`${pending.count} · ${fmtUsdt(pending.amount)}`} tone="gold" />
        <StatCard label="Credited (lifetime)" value={`${credited.count} · ${fmtUsdt(credited.amount)}`} tone="mint" />
      </div>

      <div className="game-panel hud-corner mt-3 rounded-2xl p-4">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.deposits.series} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDate} stroke={CHART.muted} fontSize={11} tickLine={false} axisLine={{ stroke: CHART.grid }} />
              <YAxis stroke={CHART.muted} fontSize={11} tickLine={false} axisLine={false} tickFormatter={fmtUsdtShort} width={48} />
              <Tooltip
                cursor={{ stroke: CHART.muted, strokeWidth: 1 }}
                content={<ChartTooltip unit="USDT" formatValue={fmtUsdt} formatLabel={fmtDate} />}
              />
              {(filter === "All" || filter === "UNMATCHED") && (
                <Area type="monotone" dataKey="unmatched" name="Unmatched" stroke={CHART.risk} fill={CHART.riskSoft} strokeWidth={2} isAnimationActive={false} />
              )}
              {(filter === "All" || filter === "PENDING") && (
                <Area type="monotone" dataKey="pending" name="Pending" stroke={CHART.gold} fill={CHART.goldSoft} strokeWidth={2} isAnimationActive={false} />
              )}
              {(filter === "All" || filter === "CREDITED") && (
                <Area type="monotone" dataKey="credited" name="Credited" stroke={CHART.mint} fill={CHART.mintSoft} strokeWidth={2} isAnimationActive={false} />
              )}
              {filter === "All" && <Legend wrapperStyle={{ fontSize: 11 }} />}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="game-panel hud-corner mt-3 overflow-hidden rounded-2xl">
        {recent.length === 0 ? (
          <p className="p-4 text-xs text-muted">No deposits{filter !== "All" ? ` with status ${filter}` : ""} yet.</p>
        ) : (
          <table className="w-full text-xs">
            <tbody>
              {recent.map((d) => (
                <tr key={d.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${DEPOSIT_STATUS_STYLE[d.status]}`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-semibold">{fmtUsdt(d.amount)}</td>
                  <td className="px-4 py-2.5 text-muted">{d.chain}</td>
                  <td className="px-4 py-2.5 text-muted">{shortAddr(d.walletAddress ?? d.fromAddress)}</td>
                  <td className="px-4 py-2.5 text-right text-muted">{fmtDateTime(d.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="border-t border-line px-4 py-2.5">
          <Link href="/admin/deposits" className="text-[11px] font-semibold text-gold hover:underline">
            View all deposits →
          </Link>
        </div>
      </div>
    </section>
  );
}

const WITHDRAWAL_FILTERS = ["All", "Requested", "Completed"] as const;

function WithdrawalsSection({ data }: { data: AdminOverview }) {
  const [filter, setFilter] = useState<(typeof WITHDRAWAL_FILTERS)[number]>("All");
  const { pending, completed } = data.withdrawals.totals;
  const netSent = completed.amount - data.withdrawals.feesCollected;

  const recentFilterStatus = filter === "Requested" ? "PENDING" : filter === "Completed" ? "COMPLETED" : null;
  const recent = useMemo(
    () => (recentFilterStatus ? data.withdrawals.recent.filter((w) => w.status === recentFilterStatus) : data.withdrawals.recent),
    [data.withdrawals.recent, recentFilterStatus]
  );

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gold">▸ Withdrawals</h2>
        <div className="flex flex-wrap gap-2">
          {WITHDRAWAL_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                filter === f ? "border-gold bg-gold-soft text-gold" : "border-line bg-panel text-muted"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Pending" value={`${pending.count} · ${fmtUsdt(pending.amount)}`} tone="gold" />
        <StatCard label="Completed (lifetime)" value={`${completed.count} · ${fmtUsdt(completed.amount)}`} tone="mint" />
        <StatCard label="Fees Collected" value={fmtUsdt(data.withdrawals.feesCollected)} />
        <StatCard label="Net Sent (completed − fees)" value={fmtUsdt(netSent)} tone="mint" />
      </div>

      <div className="game-panel hud-corner mt-3 rounded-2xl p-4">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.withdrawals.series} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDate} stroke={CHART.muted} fontSize={11} tickLine={false} axisLine={{ stroke: CHART.grid }} />
              <YAxis stroke={CHART.muted} fontSize={11} tickLine={false} axisLine={false} tickFormatter={fmtUsdtShort} width={48} />
              <Tooltip
                cursor={{ stroke: CHART.muted, strokeWidth: 1 }}
                content={<ChartTooltip unit="USDT" formatValue={fmtUsdt} formatLabel={fmtDate} />}
              />
              {(filter === "All" || filter === "Requested") && (
                <Area type="monotone" dataKey="requested" name="Requested" stroke={CHART.gold} fill={CHART.goldSoft} strokeWidth={2} isAnimationActive={false} />
              )}
              {(filter === "All" || filter === "Completed") && (
                <Area type="monotone" dataKey="completed" name="Completed" stroke={CHART.mint} fill={CHART.mintSoft} strokeWidth={2} isAnimationActive={false} />
              )}
              {filter === "All" && <Legend wrapperStyle={{ fontSize: 11 }} />}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="game-panel hud-corner mt-3 overflow-hidden rounded-2xl">
        {recent.length === 0 ? (
          <p className="p-4 text-xs text-muted">No withdrawals{filter !== "All" ? ` (${filter.toLowerCase()})` : ""} yet.</p>
        ) : (
          <table className="w-full text-xs">
            <tbody>
              {recent.map((w) => (
                <tr key={w.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${WITHDRAWAL_STATUS_STYLE[w.status]}`}>
                      {w.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-semibold">{fmtUsdt(w.amount)}</td>
                  <td className="px-4 py-2.5 text-muted">
                    {w.networkFeeUsdt !== null ? `fee ${fmtUsdt(w.networkFeeUsdt)}` : "fee -"}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{shortAddr(w.address)}</td>
                  <td className="px-4 py-2.5 text-right text-muted">{fmtDateTime(w.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="border-t border-line px-4 py-2.5">
          <Link href="/admin/withdrawals" className="text-[11px] font-semibold text-gold hover:underline">
            View all withdrawals →
          </Link>
        </div>
      </div>
    </section>
  );
}
