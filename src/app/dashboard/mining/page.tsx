"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Pickaxe } from "lucide-react";
import { OnboardingGate } from "@/components/OnboardingGate";
import { BalanceCard } from "@/components/BalanceCard";
import { Dropdown } from "@/components/Dropdown";
import { ChartTooltip } from "@/components/ChartTooltip";
import { CompositionBar } from "@/components/CompositionBar";
import { AmountField } from "@/components/AmountField";
import { RigIllustration } from "@/components/RigIllustration";
import { InfoTooltip } from "@/components/InfoTooltip";
import { SuccessModal, type SuccessModalRow } from "@/components/SuccessModal";
import {
  useBalances,
  useMiningProof,
  useActivateRig,
  usePurchasePower,
  useMiningHistory,
  useMiningRateHistory,
  useMiningEconomicsConfig,
  useConvertQuote,
  type FundingSource,
} from "@/lib/hooks";
import {
  RIG_DISPLAY_NAME,
  levelDisplayNameWithPlus,
  HASHRATE_PER_USDT,
  HASHRATE_TERM_DAYS,
  MIN_HASHRATE_PURCHASE_USDT as MIN_PURCHASE_USDT,
  MINING_PACKAGES,
  ACTIVATION_PRICE_USDT,
} from "@/lib/mining-shared";
import { CHART } from "@/lib/chart-theme";
import { useLocale } from "@/lib/i18n/LocaleProvider";

function fmtDoge(n: number) {
  return `${n.toFixed(6)} DOGE`;
}
function fmtDogeShort(n: number) {
  return `${n.toFixed(2)} DOGE`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function MiningPage() {
  return (
    <OnboardingGate>
      <MiningContent />
    </OnboardingGate>
  );
}

// Ratio-against-a-limit meter — fill carries the value, the unfilled
// track is the same hue at low opacity so state reads across the
// whole bar even without reading the number.
function Meter({ label, pct, color }: { label: string; pct: number; color: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{label}</p>
        <p className="stat-value text-sm" style={{ color }}>{pct.toFixed(2)}%</p>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full" style={{ background: `${color}1f` }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${clamped}%`, background: color }} />
      </div>
    </div>
  );
}

function MiningContent() {
  const { t } = useLocale();
  const SOURCE_LABEL: Record<FundingSource, string> = {
    GAME_REWARD_USDT: t("dashboardHome.gameRewardUsdt"),
    REFERRAL_USDT: t("dashboardHome.referralUsdt"),
    PLAY_USDT: t("dashboardHome.playUsdt"),
    RECYCLED_USDT: t("wallet.recycledUsdtLabel"),
  };
  const { data: balances } = useBalances();
  const { data: proof, isLoading } = useMiningProof();
  const { data: history } = useMiningHistory();
  const { data: rateHistory } = useMiningRateHistory();
  const { data: economicsConfig } = useMiningEconomicsConfig();
  const { data: todayQuote } = useConvertQuote(proof?.estimatedTodayDoge ?? 0);
  // A nominal 1-DOGE quote just to read the live rate — independent of
  // todayQuote (disabled/undefined whenever the wallet has no active
  // contract yet), so the Output Chart's DOGE projection works even
  // before the user owns any hashrate.
  const { data: liveRateQuote } = useConvertQuote(1);
  const targetRoiPct = economicsConfig?.targetRoiPct ?? 0.1;
  const [now] = useState(() => Date.now());
  const activate = useActivateRig();
  const purchase = usePurchasePower();

  const [amount, setAmount] = useState(MIN_PURCHASE_USDT);
  const [source, setSource] = useState<FundingSource>("GAME_REWARD_USDT");
  const [activateSource, setActivateSource] = useState<FundingSource>("GAME_REWARD_USDT");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [successModal, setSuccessModal] = useState<{ title: string; body?: string; rows: SuccessModalRow[] } | null>(null);

  // Scrolls the adjacent Buy Hashrate panel into view instead of
  // duplicating its amount/source/purchase controls here — this panel
  // (Your Rig, "no hashrate yet" state) is purely a nudge, not a second
  // place to actually buy from. Smoothly relevant on mobile, where the
  // two panels stack vertically and Buy Hashrate can be a full scroll
  // away; a harmless no-op on desktop's side-by-side layout where it's
  // already on screen.
  function scrollToBuyHashrate() {
    document.getElementById("buy-hashrate-panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function doActivate() {
    setFeedback(null);
    try {
      await activate.mutateAsync({ source: activateSource });
      setSuccessModal({
        title: t("mining.activationSuccessTitle"),
        body: t("mining.activationSuccessBody"),
        rows: [{ label: t("mining.activationSuccessAmountLabel"), value: `$${ACTIVATION_PRICE_USDT.toFixed(2)} ${SOURCE_LABEL[activateSource]}` }],
      });
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : t("mining.activationFailedFeedback"));
    }
  }

  async function doPurchase() {
    setFeedback(null);
    try {
      const spentUsdt = amount;
      const spentSource = source;
      const res = await purchase.mutateAsync({ amountUsdt: spentUsdt, source: spentSource });
      setSuccessModal({
        title: t("mining.purchaseSuccessTitle"),
        rows: [
          { label: t("mining.purchaseSuccessHashrateLabel"), value: `+${res.miningPower.toFixed(1)} MH/s` },
          { label: t("mining.purchaseSuccessPackageLabel"), value: levelDisplayNameWithPlus(res.level, res.miningPower) },
          { label: t("mining.purchaseSuccessAmountLabel"), value: `$${spentUsdt.toFixed(2)}` },
          { label: t("mining.purchaseSuccessSourceLabel"), value: SOURCE_LABEL[spentSource] },
        ],
      });
      // Reset the input back to 0 now that the purchase went through —
      // leaving the last-purchased amount sitting there reads as if it
      // hasn't been spent yet.
      setAmount(0);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : t("mining.purchaseFailedFeedback"));
    }
  }

  const balanceForSource = (s: FundingSource) =>
    s === "GAME_REWARD_USDT"
      ? balances?.gameRewardUsdt ?? 0
      : s === "REFERRAL_USDT"
      ? balances?.referralUsdt ?? 0
      : s === "PLAY_USDT"
      ? balances?.playUsdt ?? 0
      : balances?.recycledUsdt ?? 0;

  // Fixed 7-day window (the 7 most recent fully-elapsed days, ending
  // yesterday — a day never has a real allocation until it's fully
  // settled), zero-filled for any day with no allocation rather than
  // only plotting whatever sparse real rows happen to exist — the
  // same "always show the full week" fix applied to the payout-rate
  // chart above.
  const allocationByDate = new Map((history?.allocations ?? []).map((a) => [a.epochDate.slice(0, 10), a]));
  const allocationSeries = Array.from({ length: 7 }, (_, i) => {
    const daysAgo = 7 - i;
    const raw = new Date(now - daysAgo * 24 * 60 * 60 * 1000);
    // Truncate to UTC midnight before formatting — epochDate values are
    // always exactly UTC midnight, but `raw` still carries today's
    // real time-of-day. fmtDate formats in the browser's LOCAL
    // timezone, so an un-truncated evening-UTC timestamp can display
    // as the next calendar day for anyone east of UTC (or the previous
    // day west of UTC), showing a date one day off from the actual
    // epochDate the value was matched against.
    const d = new Date(Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate()));
    const key = d.toISOString().slice(0, 10);
    const a = allocationByDate.get(key);
    return {
      date: fmtDate(d.toISOString()),
      dogeAllocated: a?.dogeAllocated ?? 0,
      // effectiveMp is hashrate-HOURS (miningPower × activeHours that
      // day, see settleEpochForDate's own doc-comment) — dividing by 24
      // recovers the day's average MH/s, directly comparable to the
      // "Hashrate" stat shown elsewhere on this page in plain MH/s. A
      // full-height bar means mining at the full contracted rate all
      // day; a shorter bar means the contract only covered part of
      // that day (just activated, or expired partway through).
      avgHashrateMhs: (a?.effectiveMp ?? 0) / 24,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-4 md:grid-cols-2">
        <div className="game-panel hud-corner rounded-2xl p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gold">⛏ {t("mining.yourRigLabel")}</p>
          {isLoading ? (
            <p className="mt-2 text-sm text-muted">{t("mining.loadingLabel")}</p>
          ) : !proof?.activated ? (
            <>
              <h3 className="mt-1 text-lg font-bold">{t("mining.notActivatedTitle")}</h3>
              <p className="mt-1 text-sm text-muted">
                {t("mining.notActivatedBody")}
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <Dropdown
                  value={activateSource}
                  onChange={setActivateSource}
                  options={(Object.keys(SOURCE_LABEL) as FundingSource[]).map((s) => ({
                    value: s,
                    label: `${SOURCE_LABEL[s]} ($${balanceForSource(s).toFixed(2)} ${t("mining.availableSuffix")})`,
                  }))}
                />
                <button
                  onClick={doActivate}
                  disabled={activate.isPending || balanceForSource(activateSource) < ACTIVATION_PRICE_USDT}
                  className="btn-game hud-corner rounded-full px-4 py-2 text-sm"
                >
                  {activate.isPending ? t("mining.activatingButton") : t("mining.activateButton")}
                </button>
                {balanceForSource(activateSource) < ACTIVATION_PRICE_USDT && (
                  <p className="text-xs text-risk">
                    {t("mining.insufficientBalanceHint", {
                      amount: `$${balanceForSource(activateSource).toFixed(2)}`,
                      source: SOURCE_LABEL[activateSource],
                    })}
                  </p>
                )}
              </div>
            </>
          ) : proof?.hasContract ? (
            <>
              <h3 className="text-glow-gold mt-1 text-2xl font-black">
                {levelDisplayNameWithPlus(proof.level ?? "", proof.miningPower ?? 0)}
              </h3>
              <p className="mt-1 text-sm text-muted">
                {t("mining.activeHint", {
                  power: proof.miningPower?.toFixed(1) ?? "0",
                  date: new Date(proof.expiresAt!).toLocaleDateString(),
                })}
              </p>
              <RigIllustration level={RIG_DISPLAY_NAME[proof.level as keyof typeof RIG_DISPLAY_NAME] ?? proof.level} />
            </>
          ) : (
            <>
              <h3 className="mt-1 text-lg font-bold">{t("mining.noHashrateTitle")}</h3>
              <p className="mt-1 text-sm text-muted">
                {t("mining.noHashrateBody", { min: MIN_PURCHASE_USDT })}
              </p>
              <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-mint/20 bg-mint-soft/40 px-4 py-5 text-center">
                <Pickaxe size={26} className="text-mint" strokeWidth={1.75} />
                <p className="text-sm font-semibold text-foreground">{t("mining.noHashrateCtaHeadline")}</p>
                <button onClick={scrollToBuyHashrate} className="btn-game hud-corner mt-1 rounded-full px-4 py-2 text-sm">
                  {t("mining.noHashrateCtaButton")}
                </button>
              </div>
            </>
          )}
        </div>

        <div id="buy-hashrate-panel" className="game-panel hud-corner rounded-2xl border-mint/15 p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-mint">⚡ {t("mining.buyHashrateLabel")}</p>
          <p className="mt-1 text-sm text-muted">
            {t("mining.buyHashrateBody", { rate: HASHRATE_PER_USDT, min: MIN_PURCHASE_USDT, days: HASHRATE_TERM_DAYS })}
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <AmountField
              value={amount}
              max={balanceForSource(source)}
              min={MIN_PURCHASE_USDT}
              step={0.5}
              onChange={setAmount}
            />
            <Dropdown
              value={source}
              onChange={setSource}
              options={(Object.keys(SOURCE_LABEL) as FundingSource[]).map((s) => ({
                value: s,
                label: `${SOURCE_LABEL[s]} ($${balanceForSource(s).toFixed(2)} ${t("mining.availableSuffix")})`,
              }))}
            />
            <button
              onClick={doPurchase}
              disabled={
                !proof?.activated ||
                purchase.isPending ||
                amount < MIN_PURCHASE_USDT ||
                amount > balanceForSource(source)
              }
              className="btn-game-outline hud-corner rounded-full px-4 py-2 text-sm disabled:opacity-50"
            >
              {purchase.isPending ? t("mining.purchasingButton") : t("mining.buyMhsButton", { amount: (amount * HASHRATE_PER_USDT).toFixed(1) })}
            </button>
            {!proof?.activated && (
              <p className="text-xs text-risk">{t("mining.activateFirstHint")}</p>
            )}
            {amount < MIN_PURCHASE_USDT && (
              <p className="text-xs text-risk">{t("mining.minPurchaseHint", { min: MIN_PURCHASE_USDT })}</p>
            )}
            {amount >= MIN_PURCHASE_USDT && amount > balanceForSource(source) && (
              <p className="text-xs text-risk">
                {t("mining.insufficientBalanceHint", {
                  amount: `$${balanceForSource(source).toFixed(2)}`,
                  source: SOURCE_LABEL[source],
                })}
              </p>
            )}
          </div>
        </div>
      </section>

      {feedback && (
        <p className="game-panel rounded-xl px-4 py-2 text-sm text-risk">{feedback}</p>
      )}

      {successModal && (
        <SuccessModal
          title={successModal.title}
          body={successModal.body}
          rows={successModal.rows}
          onClose={() => setSuccessModal(null)}
        />
      )}

      <section>
        <h2 className="mb-3 flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.2em] text-gold">
          ▸ {t("mining.outputChartHeading")}
          <InfoTooltip text={t("mining.outputChartTooltip")} />
        </h2>
        <div className="game-panel hud-corner overflow-x-auto rounded-2xl">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line bg-panel-2 text-left text-[10px] font-bold uppercase tracking-widest text-muted">
                <th className="px-4 py-2.5">{t("mining.packageColumn")}</th>
                <th className="px-4 py-2.5 text-right">{t("mining.hashrateColumn")}</th>
                <th className="px-4 py-2.5 text-right">{t("mining.approxUsdtPerDayColumn")}</th>
                <th className="px-4 py-2.5 text-right">{t("mining.approxUsdtPerTermColumn", { days: HASHRATE_TERM_DAYS })}</th>
                <th className="px-4 py-2.5 text-right">{t("mining.targetRoiColumn")}</th>
              </tr>
            </thead>
            <tbody>
              {MINING_PACKAGES.map((pkg) => {
                const targetTermUsdt = pkg.priceUsdt * (1 + targetRoiPct);
                const targetDailyUsdt = targetTermUsdt / HASHRATE_TERM_DAYS;
                // The target reward is fixed in USDT (the guarantee) —
                // the DOGE amount that actually gets credited is that
                // USDT value divided by whatever DOGE costs right now,
                // so it moves with the live rate even though the USDT
                // figure underneath it never does.
                const rate = liveRateQuote?.rate;
                const targetDailyDoge = rate ? targetDailyUsdt / rate : null;
                const targetTermDoge = rate ? targetTermUsdt / rate : null;
                return (
                  <tr key={pkg.level} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 font-semibold">{pkg.name}</td>
                    <td className="px-4 py-2.5 text-right text-muted">{pkg.hashrateLabel}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-mint">
                      {targetDailyDoge !== null ? (
                        <>
                          {targetDailyDoge.toFixed(4)} DOGE
                          <div className="text-[11px] font-normal text-muted">≈ ${targetDailyUsdt.toFixed(4)}</div>
                        </>
                      ) : (
                        `$${targetDailyUsdt.toFixed(4)}`
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-mint">
                      {targetTermDoge !== null ? (
                        <>
                          {targetTermDoge.toFixed(2)} DOGE
                          <div className="text-[11px] font-normal text-muted">≈ ${targetTermUsdt.toFixed(2)}</div>
                        </>
                      ) : (
                        `$${targetTermUsdt.toFixed(2)}`
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gold">+{(targetRoiPct * 100).toFixed(0)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.2em] text-mint">
          ▸ {t("mining.dailyPayoutRateHeading")}
          <InfoTooltip text={t("mining.dailyPayoutRateTooltip")} />
        </h2>
        <div className="game-panel hud-corner rounded-2xl p-5">
          {!rateHistory ? (
            <p className="text-sm text-muted">{t("mining.loadingLabel")}</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={[
                    ...rateHistory.rows.map((r) => ({
                      epochDate: r.epochDate,
                      paid: r.actualDogePerMhsDay,
                      reference: rateHistory.exampleDogePerMhsDay,
                    })),
                    {
                      epochDate: rateHistory.liveToday.epochDate,
                      live: rateHistory.liveToday.rate,
                      reference: rateHistory.exampleDogePerMhsDay,
                    },
                  ]}
                  margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                >
                  <CartesianGrid stroke={CHART.grid} vertical={false} />
                  <XAxis
                    dataKey="epochDate"
                    tickFormatter={fmtDate}
                    stroke={CHART.muted}
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: CHART.grid }}
                  />
                  <YAxis
                    stroke={CHART.muted}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tickFormatter={(n: number) => n.toFixed(4)}
                  />
                  <Tooltip
                    cursor={{ stroke: CHART.muted, strokeWidth: 1 }}
                    content={<ChartTooltip unit="DOGE/MH/s/day" formatValue={(n) => n.toFixed(4)} formatLabel={fmtDate} />}
                  />
                  <Line
                    type="monotone"
                    dataKey="reference"
                    name={t("mining.referenceRateLegend")}
                    stroke={CHART.gold}
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="paid"
                    name={t("mining.paidLegend")}
                    stroke={CHART.mint}
                    strokeWidth={2}
                    dot={{ r: 3, fill: CHART.mint }}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="live"
                    name={t("mining.todayLiveLegend")}
                    stroke={CHART.mint}
                    strokeWidth={0}
                    dot={{ r: 4, fill: "transparent", stroke: CHART.mint, strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-gold">
          ▸ {t("mining.miningProofHeading")}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <BalanceCard
            label={t("mining.contractedHashrateLabel")}
            value={proof ? `${proof.contractedHashrateGhs.toFixed(2)} GH/s` : "…"}
          />
          <BalanceCard
            label={t("mining.observed24hLabel")}
            value={proof ? `${proof.observedHashrate24hGhs.toFixed(2)} GH/s` : "…"}
          />
          <BalanceCard
            label={t("mining.observed7dLabel")}
            value={proof ? `${proof.observedHashrate7dGhs.toFixed(2)} GH/s` : "…"}
          />
          <BalanceCard
            label={t("mining.acceptedSharesLabel")}
            value={proof ? proof.acceptedShares.toLocaleString() : "…"}
          />
        </div>

        {proof && (
          <div className="game-panel hud-corner mt-3 grid gap-5 rounded-2xl p-5 sm:grid-cols-2">
            <div className="flex flex-col justify-center gap-4">
              <Meter label={t("mining.uptime24hLabel")} pct={proof.uptime24hPct} color={CHART.mint} />
              <Meter label={t("mining.uptime7dLabel")} pct={proof.uptime7dPct} color={CHART.mint} />
            </div>
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">
                {t("mining.shareQualityLabel")}
              </p>
              <CompositionBar
                segments={[
                  { label: t("mining.acceptedLabel"), value: proof.acceptedShares, color: CHART.mint },
                  {
                    label: t("mining.rejectedLabel"),
                    value: Math.round((proof.acceptedShares * proof.rejectedSharePct) / 100),
                    color: CHART.risk,
                  },
                ]}
              />
            </div>
          </div>
        )}
      </section>

      {proof && (
        <section>
          <h2 className="mb-3 flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.2em] text-mint">
            ▸ {t("mining.estimatedTodayHeading")}
            <InfoTooltip
              text={`${t("mining.estimatedTodayTooltip")}${todayQuote ? ` ($${todayQuote.rate.toFixed(5)}/DOGE)` : ""}`}
            />
          </h2>
          <div className="game-panel hud-corner rounded-2xl p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{t("mining.packageColumn")}</p>
                <p className="stat-value mt-1 text-base">
                  {proof.hasContract ? levelDisplayNameWithPlus(proof.level ?? "", proof.miningPower ?? 0) : "-"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{t("mining.hashrateColumn")}</p>
                <p className="stat-value mt-1 text-base">{proof.hasContract ? `${proof.miningPower?.toFixed(1)} MH/s` : "-"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{t("mining.productionTodayLabel")}</p>
                <p className="stat-value text-glow-mint mt-1 text-base text-mint">{fmtDoge(proof.estimatedTodayDoge)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{t("mining.projectedTodayLabel")}</p>
                <p className="stat-value mt-1 text-base text-mint">{fmtDoge(proof.projectedFullDayDoge)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{t("mining.usdLiveRateLabel")}</p>
                <p className="stat-value mt-1 text-base text-mint">
                  {todayQuote ? `$${(todayQuote.dogeAmount * todayQuote.rate).toFixed(4)}` : "…"}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {proof && (
        <section>
          <h2 className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-gold">
            ▸ {t("mining.miningRoiHeading")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {/* Total lifetime value credited from mining — sits alongside
                the ROI percentages below rather than replacing them: a
                percentage alone doesn't say how much that actually is in
                real terms, and this is the one number on the page that
                answers "how much have I actually made so far," summed
                across every contract the wallet has ever held (active or
                matured), same totalCumulativeCreditedUsdtEquiv source the
                ROI percentages themselves are derived from. */}
            <div className="game-panel hud-corner rounded-2xl p-5">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted">
                {t("mining.totalMiningValueLabel")}
                <InfoTooltip text={t("mining.totalMiningValueTooltip")} />
              </p>
              <p className="stat-value mt-1 text-2xl text-mint">
                {liveRateQuote?.rate
                  ? fmtDogeShort(proof.roiSummary.totalCumulativeCreditedUsdtEquiv / liveRateQuote.rate)
                  : "…"}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                ≈ ${proof.roiSummary.totalCumulativeCreditedUsdtEquiv.toFixed(2)} USDT
              </p>
            </div>
            {proof.roiSummary.hasMaturedContract ? (
              <>
                <div className="game-panel hud-corner rounded-2xl p-5">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted">
                    {t("mining.packageRoiLabel")}
                    <InfoTooltip text={t("mining.packageRoiTooltip")} />
                  </p>
                  <p className={`stat-value mt-1 text-2xl ${proof.roiSummary.packageRoiPct >= 0 ? "text-mint" : "text-risk"}`}>
                    {proof.roiSummary.packageRoiPct >= 0 ? "+" : ""}
                    {proof.roiSummary.packageRoiPct.toFixed(2)}%
                  </p>
                </div>
                <div className="game-panel hud-corner rounded-2xl p-5">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted">
                    {t("mining.totalFirstCycleRoiLabel")}
                    <InfoTooltip text={t("mining.totalFirstCycleRoiTooltip")} />
                  </p>
                  <p className={`stat-value mt-1 text-2xl ${proof.roiSummary.totalFirstCycleRoiPct >= 0 ? "text-mint" : "text-risk"}`}>
                    {proof.roiSummary.totalFirstCycleRoiPct >= 0 ? "+" : ""}
                    {proof.roiSummary.totalFirstCycleRoiPct.toFixed(2)}%
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="game-panel hud-corner rounded-2xl p-5">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted">
                    {t("mining.guaranteedRoiLabel")}
                    <InfoTooltip text={t("mining.guaranteedRoiTooltip", { days: HASHRATE_TERM_DAYS })} />
                  </p>
                  <p className="stat-value mt-1 text-2xl text-mint">
                    +{proof.roiSummary.guaranteedRoiPct.toFixed(2)}%
                  </p>
                </div>
                <div className="game-panel hud-corner rounded-2xl p-5">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted">
                    {t("mining.onTrackLabel")}
                    <InfoTooltip text={t("mining.onTrackTooltip")} />
                  </p>
                  <p
                    className={`stat-value mt-1 text-2xl ${
                      proof.roiSummary.onTrackPct === null
                        ? "text-muted"
                        : proof.roiSummary.onTrackPct >= 95
                        ? "text-mint"
                        : proof.roiSummary.onTrackPct >= 80
                        ? "text-gold"
                        : "text-risk"
                    }`}
                  >
                    {proof.roiSummary.onTrackPct === null ? "-" : `${proof.roiSummary.onTrackPct.toFixed(1)}%`}
                  </p>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-mint">
          ▸ {t("mining.outputHashrateHistoryHeading")}
        </h2>
        {!history?.allocations.length ? (
          <div className="game-panel hud-corner rounded-2xl p-5 text-sm text-muted">
            {t("mining.notEnoughEpochsBody")}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="game-panel hud-corner rounded-2xl p-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-mint">{t("mining.dogeAllocatedPerEpochLabel")}</p>
              <div className="mt-3 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={allocationSeries} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={CHART.grid} vertical={false} />
                    <XAxis dataKey="date" stroke={CHART.muted} fontSize={11} tickLine={false} axisLine={{ stroke: CHART.grid }} />
                    <Tooltip
                      cursor={{ stroke: CHART.muted, strokeWidth: 1 }}
                      content={<ChartTooltip unit="" color={CHART.mint} formatValue={fmtDogeShort} />}
                    />
                    <Area
                      type="monotone"
                      dataKey="dogeAllocated"
                      stroke={CHART.mint}
                      strokeWidth={2}
                      fill={CHART.mint}
                      fillOpacity={0.1}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="game-panel hud-corner rounded-2xl p-5">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gold">
                {t("mining.avgHashratePerEpochLabel")}
                <InfoTooltip text={t("mining.avgHashratePerEpochTooltip")} />
              </p>
              <div className="mt-3 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={allocationSeries} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={CHART.grid} vertical={false} />
                    <XAxis dataKey="date" stroke={CHART.muted} fontSize={11} tickLine={false} axisLine={{ stroke: CHART.grid }} />
                    <Tooltip
                      cursor={{ fill: CHART.panel2 }}
                      content={<ChartTooltip unit="MH/s" color={CHART.gold} formatValue={(n) => n.toLocaleString(undefined, { maximumFractionDigits: 1 })} />}
                    />
                    <Bar dataKey="avgHashrateMhs" fill={CHART.gold} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </section>

      {proof?.lastEpoch && (
        <section>
          <h2 className="mb-3 flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.2em] text-mint">
            ▸ {t("mining.yesterdaySettledHeading")} ({new Date(proof.lastEpoch.epochDate).toLocaleDateString()})
            <InfoTooltip text={t("mining.yesterdaySettledTooltip")} />
          </h2>

          {/* Your own breakdown (gross output − fees − electricity =
              settled allocation), not the platform-wide epoch totals —
              summed across all your contracts server-side (see
              yourGrossOutputDoge etc. in /api/mining/proof). A reserve
              top-up (when your organic output alone fell short of your
              guaranteed rate) is disclosed as a footnote rather than a
              bold line in the bar/table — still honestly traceable
              (gross − fees − electricity + top-up = your allocation),
              just de-emphasized since it's the least actionable figure
              here for an individual wallet. */}
          <div className="game-panel hud-corner rounded-2xl p-5">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">
              {t("mining.grossToNetLabel")}
            </p>
            <CompositionBar
              segments={[
                { label: t("mining.yourSettledAllocationLabel"), value: proof.lastEpoch.yourAllocationDoge ?? 0, color: CHART.mint },
                { label: t("mining.poolProviderFeesLabel"), value: proof.lastEpoch.yourPoolFeesDoge, color: CHART.gold },
                { label: t("mining.maintenanceLabel"), value: proof.lastEpoch.yourElectricityDoge, color: CHART.violet },
              ]}
            />
            {proof.lastEpoch.yourReserveDrawDoge > 0 && (
              // Mint/"+", not text-risk (red) — this ADDS to what you're
              // credited (it's why your organic output alone fell short
              // of the guaranteed rate, and the reserve made up the
              // difference), never a deduction from your payout. Red
              // here previously read as "money taken away," which is
              // backwards — confirmed confusing on a real user.
              <p className="mt-2 text-xs text-mint">
                {t("mining.reserveTopUpAppliedLabel", { amount: fmtDogeShort(proof.lastEpoch.yourReserveDrawDoge) })}
              </p>
            )}
          </div>

          <div className="game-panel hud-corner mt-3 overflow-x-auto rounded-2xl">
            <table className="w-full text-sm">
              <tbody>
                {[
                  [t("mining.yourGrossOutputLabel"), fmtDoge(proof.lastEpoch.yourGrossOutputDoge)],
                  [t("mining.poolProviderFeesLabel"), `− ${fmtDoge(proof.lastEpoch.yourPoolFeesDoge)}`],
                  [t("mining.maintenanceLabel"), `− ${fmtDoge(proof.lastEpoch.yourElectricityDoge)}`],
                  [
                    t("mining.yourSettledAllocationLabel"),
                    proof.lastEpoch.yourAllocationDoge !== null
                      ? fmtDoge(proof.lastEpoch.yourAllocationDoge)
                      : t("mining.noActiveHashrateYesterday"),
                  ],
                ].map(([label, value], i) => (
                  <tr key={label} className={i < 3 ? "border-b border-line" : ""}>
                    <td className="px-4 py-2.5 text-muted">{label}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
