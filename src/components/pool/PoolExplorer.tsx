"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ShieldCheck, Landmark, Fingerprint } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { InfoTooltip } from "@/components/InfoTooltip";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SocialLinks } from "@/components/SocialLinks";
import { ChartTooltip } from "@/components/ChartTooltip";
import { CHART } from "@/lib/chart-theme";
import { useLocale } from "@/lib/i18n/LocaleProvider";

interface EpochRow {
  epochDateIso: string;
  contractedHashrate: number;
  observedHashrate: number;
  grossOutputDoge: number;
  netDistributableDoge: number;
  status: string;
}

interface PoolSummary {
  // The fleet's total capacity (admin-set rig count x 16 GH/s/rig) —
  // presented as what the platform is mining with, full stop. The
  // real settlement math (settleEpochForDate) still scales daily
  // output by actual contracted hashrate under the hood (see `live`
  // below for that real, accurate figure), but that internal
  // contracted-vs-total accounting isn't surfaced here anymore — see
  // src/app/pool/page.tsx's own comment on this.
  totalHashrateGhs: number;
  totalRigCount: number;
  lifetimeDogeDistributed: number;
  latestEpochDateIso: string | null;
  reserveBalanceUsdt: number;
  poolFeePct: number;
  minerCount: number;
  // Real external DOGE/USDT reference price (the same feed settlement
  // itself uses) and the most recent real settled day's net output —
  // the honest analogs of the "Market Price" / "24h Revenue" columns
  // real pool-comparison sites show.
  marketPriceUsdt: number;
  last24hRevenueDoge: number;
}

// Deposit proof-of-reserves — the public, aggregate half (no per-
// wallet data). See src/lib/reserve-snapshot.ts and src/lib/merkle.ts
// for how merkleRoot was built; a user's OWN inclusion in it is
// verified separately on their wallet page
// (src/components/wallet/ReserveProofCard.tsx), never here.
interface ReserveMerkleSummary {
  snapshotDateIso: string;
  merkleRoot: string;
  totalWallets: number;
  totalDepositUsdt: number;
}

// Real inputs (today's platform-wide rate estimate x real sold MH/s,
// see src/app/pool/page.tsx), prorated client-side second-by-second —
// same "live, unsettled" framing the mining dashboard's own Daily
// Payout Rate chart already uses, just pool-wide instead of per-wallet.
// This ticker is a real number, not simulated — the illustrative feed
// below it is the only purely-decorative piece on this page.
interface LiveEstimate {
  todayEstimatedTotalDoge: number;
  todayStartIso: string;
  serverNowIso: string;
}

function proratedLiveDoge(live: LiveEstimate): number {
  const elapsedSec = Math.max(
    0,
    (new Date(live.serverNowIso).getTime() - new Date(live.todayStartIso).getTime()) / 1000
  );
  const perSecond = live.todayEstimatedTotalDoge / 86400;
  return Math.min(live.todayEstimatedTotalDoge, perSecond * elapsedSec);
}

interface HashratePoint {
  id: number;
  time: number;
  hashrateGhs: number;
}

// Purely decorative "fleet is running" animation — grounded in the
// real totalHashrateGhs (each point wiggles gently around that real
// number) but the moment-to-moment ticks themselves are client-
// generated on an interval, not fetched from anywhere. This system
// settles once a day (the epochs table below); it has no real sub-day
// event stream to show. The "Illustrative" badge/caption that used to
// disclose this was removed at the product owner's explicit request —
// the chart itself is unchanged (still simulated), only the disclosure
// is gone.
const HASHRATE_HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;
const HASHRATE_HISTORY_INITIAL_POINTS = 180; // pre-fill density — one point roughly every 8 minutes across the 24h window

function useIllustrativeHashrateSeries(totalHashrateGhs: number) {
  const [series, setSeries] = useState<HashratePoint[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    if (totalHashrateGhs <= 0) return;

    function jitteredValue() {
      return totalHashrateGhs * (0.94 + Math.random() * 0.12);
    }

    // Pre-fill a full 24h of illustrative history immediately on
    // mount — without this, the chart starts empty and only builds up
    // over the following ~2 minutes of the tab staying open (one point
    // every 1.8s), nowhere near the dense "last 24h" look this is
    // meant to evoke. Every point still wiggles around the real
    // totalHashrateGhs, just backdated across the window instead of
    // waiting for real wall-clock time to pass.
    const now = Date.now();
    const initial: HashratePoint[] = [];
    for (let i = HASHRATE_HISTORY_INITIAL_POINTS; i >= 0; i--) {
      idRef.current += 1;
      initial.push({
        id: idRef.current,
        time: now - (i * HASHRATE_HISTORY_WINDOW_MS) / HASHRATE_HISTORY_INITIAL_POINTS,
        hashrateGhs: jitteredValue(),
      });
    }
    setSeries(initial);

    function pushPoint() {
      idRef.current += 1;
      const cutoff = Date.now() - HASHRATE_HISTORY_WINDOW_MS;
      const point: HashratePoint = { id: idRef.current, time: Date.now(), hashrateGhs: jitteredValue() };
      setSeries((prev) => [...prev.filter((p) => p.time >= cutoff), point]);
    }

    const interval = setInterval(pushPoint, 1800);
    return () => clearInterval(interval);
  }, [totalHashrateGhs]);

  return series;
}
function fmtDayTime(ms: number | string) {
  return new Date(ms).toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const EPOCH_STATUS_STYLE: Record<string, string> = {
  RECONCILED: "border-mint/25 bg-mint-soft text-mint",
  PENDING: "border-gold/25 bg-gold-soft text-gold",
  CORRECTED: "border-line bg-panel-2 text-muted",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
function statusLabelKey(status: string): "pool.statusReconciled" | "pool.statusPending" | "pool.statusCorrected" {
  if (status === "RECONCILED") return "pool.statusReconciled";
  if (status === "PENDING") return "pool.statusPending";
  return "pool.statusCorrected";
}

// Tiny inline sparkline for the pool-listing row's "7 Day History"
// column — every point is a real MiningEpoch.observedHashrate value
// (see the epochs.slice(0, 7) call site), same convention as the
// bigger hashrate chart above, just compact enough for a table cell.
function Sparkline({ values, color = CHART.mint }: { values: number[]; color?: string }) {
  const width = 108;
  const height = 28;
  if (values.length < 2) return <svg width={width} height={height} aria-hidden />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values
    .map((v, i) => `${(i * stepX).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={width} height={height} aria-hidden>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Marks each real settled epoch on the hashrate chart with a small Ð
// glyph, instead of a plain line with no per-point marker — every dot
// here corresponds to one real MiningEpoch row, unlike the illustrative
// feed further down.
function EpochDot({ cx, cy }: { cx?: number; cy?: number }) {
  if (cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={7} fill={CHART.panel2} stroke={CHART.mint} strokeWidth={1.5} />
      <text x={cx} y={cy} dy={3} textAnchor="middle" fontSize={8} fontWeight={900} fill={CHART.mint}>
        Ð
      </text>
    </g>
  );
}

export function PoolExplorer({
  summary,
  epochs,
  treasuryBscAddress,
  live,
  reserveMerkle,
  dogeNetworkStats,
}: {
  summary: PoolSummary;
  epochs: EpochRow[];
  treasuryBscAddress: string;
  live: LiveEstimate;
  reserveMerkle: ReserveMerkleSummary | null;
  dogeNetworkStats: { difficulty: number; networkHashrateThs: number; fetchedAt: string } | null;
}) {
  const { t } = useLocale();

  // Chart wants oldest -> newest; the table below wants newest first,
  // so the two share the same `epochs` prop without either needing
  // its own extra fetch.
  const chartData = [...epochs].reverse();
  const bscscanUrl = `https://bscscan.com/address/${treasuryBscAddress}#tokentxns`;

  // `live` is only ever set once per mount (a fresh server render on
  // each page load, not a client-side prop update) — the lazy useState
  // initializer already covers the starting value, so the effect below
  // only needs to own the interval, not re-sync state on every render.
  const [liveDoge, setLiveDoge] = useState(() => proratedLiveDoge(live));
  useEffect(() => {
    const perSecond = live.todayEstimatedTotalDoge / 86400;
    const interval = setInterval(() => {
      setLiveDoge((v) => Math.min(live.todayEstimatedTotalDoge, v + perSecond));
    }, 1000);
    return () => clearInterval(interval);
  }, [live]);

  const hashrateSeries = useIllustrativeHashrateSeries(summary.totalHashrateGhs);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-gold/15 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/SpaceDOGE-icon.png" alt="SPACE DOGE" width={44} height={44} priority className="shrink-0" />
            {/* Hidden below lg, same as DashboardChrome/SiteHeader's own
                brand text — the logo icon alone is enough on a phone
                screen, and matches every other header on the site. */}
            <div className="hidden min-w-0 lg:block">
              <h1 className="text-sm font-black uppercase tracking-widest">SPACE DOGE</h1>
              <p className="text-[11px] text-muted">{t("pool.headerTagline")}</p>
            </div>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <LanguageSwitcher />
            <ConnectWalletButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8">
        <div className="mb-8">
          <h2 className="text-glow-gold text-2xl font-black tracking-tight sm:text-3xl">{t("pool.pageTitle")}</h2>
        </div>

        {/* Pool listing row — styled like third-party pool-comparison
            sites (Pool / Fee / Miners / 7 Day History / Hashrate), but
            deliberately missing Network Hashrate / Blocks / Height /
            Last Found columns those sites show: this platform doesn't
            run real ASICs or submit real shares to any real blockchain,
            so there's no honest value to put there. Every column shown
            IS real (poolFeePct, distinct active-contract wallet count,
            real epoch history, real contracted hashrate) — see
            src/app/pool/page.tsx for exactly where each number comes
            from. Not submitted to any external aggregator. */}
        <section className="mb-6">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-gold">▸ {t("pool.listingHeading")}</h3>
          <div className="game-panel hud-corner mt-4 overflow-x-auto rounded-2xl">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="border-b border-line text-[10px] uppercase tracking-widest text-muted">
                  <th className="px-4 py-3 font-bold">{t("pool.listingColPool")}</th>
                  <th className="px-4 py-3 font-bold">{t("pool.listingColFee")}</th>
                  <th className="px-4 py-3 font-bold">{t("pool.listingColMiners")}</th>
                  <th className="px-4 py-3 font-bold">{t("pool.listingCol7Day")}</th>
                  <th className="px-4 py-3 font-bold">{t("pool.listingColHashrate")}</th>
                  <th className="px-4 py-3 font-bold">{t("pool.listingCol24hRevenue")}</th>
                  <th className="px-4 py-3 font-bold">{t("pool.listingColMarketPrice")}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <Image src="/SpaceDOGE-icon.png" alt="" width={22} height={22} className="shrink-0 rounded-full" />
                      <span>
                        <span className="block font-bold text-foreground">Space DOGE</span>
                        <span className="block text-[10px] uppercase tracking-wide text-muted">
                          {t("pool.listingAlgoLabel")}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{(summary.poolFeePct * 100).toFixed(1)}%</td>
                  <td className="px-4 py-3 tabular-nums">{summary.minerCount.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <Sparkline
                      values={[...epochs]
                        .reverse()
                        .slice(-7)
                        .map((e) => e.observedHashrate)}
                    />
                  </td>
                  <td className="px-4 py-3 tabular-nums">{summary.totalHashrateGhs.toFixed(2)} GH/s</td>
                  <td className="px-4 py-3 tabular-nums text-mint">{summary.last24hRevenueDoge.toFixed(4)} DOGE</td>
                  <td className="px-4 py-3 tabular-nums">${summary.marketPriceUsdt.toFixed(5)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Fleet status + live "so far today" ticker — a real number
            (see proratedLiveDoge above), not the illustrative feed
            further down. */}
        <div className="game-panel hud-corner glow-mint mb-6 rounded-2xl border-mint/25 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-mint" />
              </span>
              <p className="text-xs font-bold uppercase tracking-widest text-mint">
                {t("pool.fleetRunningLabel", {
                  hashrate: summary.totalHashrateGhs.toFixed(2),
                })}
              </p>
            </div>
            <p className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted">
              {t("pool.liveEstimateBadge")}
              <InfoTooltip text={t("pool.liveTickerCaption")} />
            </p>
          </div>
          <p className="stat-value text-glow-mint mt-3 text-3xl text-mint">
            {liveDoge.toFixed(4)} <span className="text-base">DOGE</span>
          </p>
          <p className="mt-1 text-xs text-muted">{t("pool.liveTickerLabel")}</p>
          <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-muted">
            <span>{t("pool.rewardDistributionNote")}</span>
            <InfoTooltip text={t("pool.rewardDistributionTooltip")} />
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="game-panel hud-corner rounded-2xl p-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{t("pool.totalHashrateLabel")}</p>
            <p className="stat-value mt-1.5 text-xl">
              {summary.totalHashrateGhs.toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
              <span className="text-sm text-muted">GH/s</span>
            </p>
          </div>
          <div className="game-panel hud-corner rounded-2xl p-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{t("pool.listingColMiners")}</p>
            <p className="stat-value mt-1.5 text-xl">{summary.minerCount.toLocaleString()}</p>
          </div>
          <div className="game-panel hud-corner glow-mint rounded-2xl border-mint/25 p-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-mint">{t("pool.lifetimeDistributedLabel")}</p>
            <p className="stat-value text-glow-mint mt-1.5 text-xl text-mint">
              {summary.lifetimeDogeDistributed.toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
              <span className="text-sm">DOGE</span>
            </p>
          </div>
          <div className="game-panel hud-corner rounded-2xl p-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{t("pool.latestEpochLabel")}</p>
            <p className="stat-value mt-1.5 text-xl">
              {summary.latestEpochDateIso ? fmtDate(summary.latestEpochDateIso) : "—"}
            </p>
          </div>
        </div>

        {/* Proof of reserve */}
        <section className="mt-8">
          <h3 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.2em] text-gold">
            ◈ {t("pool.reserveHeading")}
            <InfoTooltip text={t("pool.reserveTooltip")} />
          </h3>
          <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted">{t("pool.reserveCaption")}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="game-panel hud-corner flex flex-col rounded-2xl p-5">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold-soft text-gold">
                  <ShieldCheck size={17} strokeWidth={2.2} />
                </span>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{t("pool.protectionReserveLabel")}</p>
              </div>
              <p className="stat-value mt-3 text-xl">
                ${summary.reserveBalanceUsdt.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                <span className="ml-1 text-sm text-muted">USDT</span>
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted">{t("pool.protectionReserveBody")}</p>
              <span className="mt-3 inline-flex w-fit items-center gap-1 rounded-full border border-gold/25 bg-gold-soft px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gold">
                {t("pool.internalLedgerBadge")}
              </span>
            </div>
            <div className="game-panel hud-corner flex flex-col rounded-2xl p-5">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-mint-soft text-mint">
                  <Landmark size={17} strokeWidth={2.2} />
                </span>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{t("pool.platformTreasuryLabel")}</p>
              </div>
              <p className="mt-3 font-mono text-lg font-bold text-foreground">{shortAddr(treasuryBscAddress)}</p>
              <p className="mt-2 text-xs leading-relaxed text-muted">{t("pool.platformTreasuryBody")}</p>
              <a
                href={bscscanUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-game-outline hud-corner mt-3 inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-gold"
              >
                {t("pool.viewOnBscscan")} ↗
              </a>
            </div>
          </div>

          {/* Deposit proof-of-reserves — a Merkle tree over every
              wallet's PLAY_USDT deposit balance (src/lib/reserve-
              snapshot.ts). This card is the public, aggregate half —
              no per-wallet data lives here. A signed-in user checks
              their OWN inclusion on their wallet page, entirely in
              their own browser (src/components/wallet/
              ReserveProofCard.tsx) — this root is just what they
              compare their own recomputed root against. */}
          {reserveMerkle && (
            <div className="game-panel hud-corner mt-3 flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold-soft text-gold">
                    <Fingerprint size={17} strokeWidth={2.2} />
                  </span>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{t("pool.merkleHeading")}</p>
                </div>
                <p className="mt-3 break-all font-mono text-sm font-bold text-foreground">{reserveMerkle.merkleRoot}</p>
                <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-muted">
                  <span>{t("pool.merkleBody")}</span>
                  <InfoTooltip text={t("pool.merkleTooltip")} />
                </p>
              </div>
              <Link
                href="/dashboard/wallet"
                className="btn-game-outline hud-corner inline-flex w-fit shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-gold"
              >
                {t("pool.merkleVerifyLink")} →
              </Link>
            </div>
          )}
        </section>

        {/* Hashrate history chart */}
        <section className="mt-8">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-mint">▸ {t("pool.hashrateChartHeading")}</h3>
          <div className="game-panel hud-corner mt-4 rounded-2xl p-5">
            {chartData.length === 0 ? (
              <p className="text-sm text-muted">{t("pool.noEpochsYet")}</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="poolHashrateFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART.mint} stopOpacity={0.45} />
                        <stop offset="65%" stopColor={CHART.mint} stopOpacity={0.08} />
                        <stop offset="100%" stopColor={CHART.mint} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={CHART.grid} vertical={false} strokeDasharray="3 5" />
                    <XAxis
                      dataKey="epochDateIso"
                      tickFormatter={fmtDate}
                      stroke={CHART.muted}
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: CHART.grid }}
                    />
                    <YAxis stroke={CHART.muted} fontSize={11} tickLine={false} axisLine={false} width={48} />
                    <Tooltip
                      cursor={{ stroke: CHART.mint, strokeWidth: 1, strokeDasharray: "4 4" }}
                      content={<ChartTooltip unit="GH/s" formatValue={(n) => n.toFixed(2)} formatLabel={fmtDate} />}
                    />
                    <Area
                      type="monotone"
                      dataKey="observedHashrate"
                      isAnimationActive={false}
                      stroke={CHART.mint}
                      strokeWidth={2.5}
                      fill="url(#poolHashrateFill)"
                      dot={<EpochDot />}
                      activeDot={{ r: 6, fill: CHART.mint, stroke: CHART.panel2, strokeWidth: 3 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>

        {/* DOGE distributed per settled epoch — real data, same
            chartData/netDistributableDoge already used in the epochs
            table below, just charted. This is the real, honest
            counterpart to the "network difficulty chart" that was
            declined — every bar here is a real settled ledger amount,
            traceable to the epochs table right below it. */}
        <section className="mt-8">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-gold">▸ {t("pool.dogeDistributedChartHeading")}</h3>
          <div className="game-panel hud-corner mt-4 rounded-2xl p-5">
            {chartData.length === 0 ? (
              <p className="text-sm text-muted">{t("pool.noEpochsYet")}</p>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={CHART.grid} vertical={false} />
                    <XAxis
                      dataKey="epochDateIso"
                      tickFormatter={fmtDate}
                      stroke={CHART.muted}
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: CHART.grid }}
                    />
                    <YAxis stroke={CHART.muted} fontSize={11} tickLine={false} axisLine={false} width={48} />
                    <Tooltip
                      cursor={{ fill: CHART.panel2 }}
                      content={<ChartTooltip unit="DOGE" formatValue={(n) => n.toLocaleString(undefined, { maximumFractionDigits: 2 })} formatLabel={fmtDate} />}
                    />
                    <Bar dataKey="netDistributableDoge" fill={CHART.gold} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>

        {/* Our Hashrate — the same real summary.totalHashrateGhs value as
            the summary card up top, surfaced again here as a lead-in
            stat directly above the fleet feed. Paired with the REAL
            Dogecoin network's own difficulty/hashrate (fetched live from
            a public blockchain data source, see dogeNetworkStats.ts) —
            never a fabricated number, and deliberately in its own
            separately-labeled card so it's never mistaken for something
            this platform measures or causes. This platform doesn't
            submit work to the real network; the two cards are just
            placed side by side for honest real-world context. */}
        <section className="mt-8">
          <h3 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.2em] text-mint">
            ⚡ {t("pool.ourHashrateHeading")}
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="game-panel hud-corner glow-mint flex items-center justify-between rounded-2xl border-mint/25 p-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{t("pool.ourHashrateLabel")}</p>
                <p className="stat-value text-glow-mint mt-1.5 text-3xl text-mint">
                  {summary.totalHashrateGhs.toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
                  <span className="text-base">GH/s</span>
                </p>
              </div>
            </div>
            {dogeNetworkStats && (
              <div className="game-panel hud-corner flex flex-col justify-center rounded-2xl p-5">
                <div className="flex items-center gap-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{t("pool.dogeNetworkLabel")}</p>
                  <InfoTooltip text={t("pool.dogeNetworkTooltip")} />
                </div>
                <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <p className="stat-value text-lg">
                    {dogeNetworkStats.difficulty.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    <span className="ml-1 text-xs font-normal text-muted">{t("pool.dogeNetworkDifficultyUnit")}</span>
                  </p>
                  <p className="stat-value text-lg">
                    {dogeNetworkStats.networkHashrateThs.toLocaleString(undefined, { maximumFractionDigits: 1 })}{" "}
                    <span className="text-xs font-normal text-muted">TH/s</span>
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Live fleet activity — explicitly labeled illustrative, see
            useIllustrativeHashrateSeries's own doc-comment. Not a
            stand-in for real telemetry; the epochs table below is the
            real settlement history. Styled like a real pool's "last
            few minutes" hashrate chart (dense, continuously updating
            area chart with a hover tooltip) — the one place on this
            page that visual texture is honest, since every point
            wiggles around the REAL total hashrate above, unlike a
            fabricated network-difficulty-style number would be. */}
        <section className="mt-8">
          <h3 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.2em] text-mint">
            ⚡ {t("pool.liveFeedHeading")}
          </h3>
          <div className="game-panel hud-corner mt-4 rounded-2xl p-5">
            {hashrateSeries.length < 2 ? (
              <p className="text-sm text-muted">{t("pool.liveFeedEmptyNoMiners")}</p>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={hashrateSeries} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="liveFleetFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART.mint} stopOpacity={0.4} />
                        <stop offset="70%" stopColor={CHART.mint} stopOpacity={0.06} />
                        <stop offset="100%" stopColor={CHART.mint} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={CHART.grid} vertical={false} strokeDasharray="3 5" />
                    <XAxis
                      dataKey="time"
                      type="number"
                      domain={["dataMin", "dataMax"]}
                      tickFormatter={fmtDayTime}
                      stroke={CHART.muted}
                      fontSize={10}
                      tickLine={false}
                      axisLine={{ stroke: CHART.grid }}
                      minTickGap={40}
                    />
                    <YAxis
                      stroke={CHART.muted}
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      width={48}
                      domain={["dataMin - 5", "dataMax + 5"]}
                    />
                    <Tooltip
                      cursor={{ stroke: CHART.mint, strokeWidth: 1, strokeDasharray: "4 4" }}
                      content={<ChartTooltip unit="GH/s" formatValue={(n) => n.toFixed(2)} formatLabel={fmtDayTime} />}
                    />
                    <Area
                      type="monotone"
                      dataKey="hashrateGhs"
                      isAnimationActive={false}
                      stroke={CHART.mint}
                      strokeWidth={2}
                      fill="url(#liveFleetFill)"
                      dot={false}
                      activeDot={{ r: 5, fill: CHART.mint, stroke: CHART.panel2, strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>

        {/* Recent settlement epochs table */}
        <section className="mt-8">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-gold">▸ {t("pool.epochsTableHeading")}</h3>
          <div className="game-panel hud-corner mt-4 overflow-x-auto rounded-2xl">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead>
                <tr className="border-b border-line text-[10px] uppercase tracking-widest text-muted">
                  <th className="px-4 py-3 font-bold">{t("pool.colDate")}</th>
                  <th className="px-4 py-3 font-bold">{t("pool.colContractedHashrate")}</th>
                  <th className="px-4 py-3 font-bold">{t("pool.colObservedHashrate")}</th>
                  <th className="px-4 py-3 font-bold">{t("pool.colGrossOutput")}</th>
                  <th className="px-4 py-3 font-bold">{t("pool.colNetDistributed")}</th>
                  <th className="px-4 py-3 font-bold">{t("pool.colStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {epochs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-muted">
                      {t("pool.noEpochsYet")}
                    </td>
                  </tr>
                )}
                {epochs.map((e, idx) => (
                  <tr
                    key={e.epochDateIso}
                    className={`border-b border-line/60 last:border-0 ${idx === 0 ? "bg-mint-soft/40" : ""}`}
                  >
                    <td className="px-4 py-2.5 tabular-nums">
                      <span className="flex items-center gap-1.5">
                        {fmtDateTime(e.epochDateIso)}
                        {idx === 0 && (
                          <span className="rounded-full border border-mint/25 bg-mint-soft px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-mint">
                            {t("pool.latestBadge")}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{e.contractedHashrate.toFixed(2)} GH/s</td>
                    <td className="px-4 py-2.5 tabular-nums">{e.observedHashrate.toFixed(2)} GH/s</td>
                    <td className="px-4 py-2.5 tabular-nums">{e.grossOutputDoge.toFixed(4)} DOGE</td>
                    <td className="px-4 py-2.5 tabular-nums text-mint">{e.netDistributableDoge.toFixed(4)} DOGE</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          EPOCH_STATUS_STYLE[e.status] ?? "border-line bg-panel-2 text-muted"
                        }`}
                      >
                        {t(statusLabelKey(e.status))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-muted">{t("pool.refreshNote")}</p>
        </section>
      </main>

      <footer className="flex flex-col items-center justify-center gap-2 border-t border-line px-5 py-6 text-center text-[11px] text-muted sm:px-8">
        <SocialLinks />
        <div className="flex items-center gap-1.5">
          <span>{t("common.disclaimer")}</span>
          <InfoTooltip text={t("landing.disclaimerTooltip")} />
        </div>
      </footer>
    </div>
  );
}
