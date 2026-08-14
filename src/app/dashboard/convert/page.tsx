"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { OnboardingGate } from "@/components/OnboardingGate";
import { AmountField } from "@/components/AmountField";
import { InfoTooltip } from "@/components/InfoTooltip";
import { useBalances, useConvertQuote, useConvert, usePtsConvert } from "@/lib/hooks";
import { PTS_TO_USDT_RATE, MIN_PTS_CONVERSION } from "@/lib/game-config";
import { useLocale } from "@/lib/i18n/LocaleProvider";

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={spinning ? "animate-spin" : ""}
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

export default function ConvertPage() {
  return (
    <OnboardingGate>
      <ConvertContent />
    </OnboardingGate>
  );
}

function ConvertContent() {
  const { t } = useLocale();
  const { data: balances } = useBalances();
  const [amount, setAmount] = useState(10);
  const { data: quote, isLoading: quoting, isFetching: quoteRefreshing, refetch: refetchQuote } = useConvertQuote(amount);
  const convert = useConvert();
  const [receipt, setReceipt] = useState<{ finalUsdt: number; dogeAmount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [ptsAmount, setPtsAmount] = useState(MIN_PTS_CONVERSION);
  const ptsConvert = usePtsConvert();
  const [ptsReceipt, setPtsReceipt] = useState<{ ptsAmount: number; usdtAmount: number } | null>(null);
  const [ptsError, setPtsError] = useState<string | null>(null);

  async function confirmPtsConvert() {
    setPtsError(null);
    setPtsReceipt(null);
    try {
      const res = await ptsConvert.mutateAsync(ptsAmount);
      setPtsReceipt({ ptsAmount: res.ptsAmount, usdtAmount: res.usdtAmount });
    } catch (err) {
      setPtsError(err instanceof Error ? err.message : t("convert.conversionFailedError"));
    }
  }

  // Ticks every second purely to force a re-render — secondsLeft itself
  // is derived below, not stored, so there's no setState-in-effect
  // cascade: the effect only ever updates `now` from its own interval
  // callback, never synchronously in the effect body.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const secondsLeft = quote ? Math.max(0, Math.round((new Date(quote.expiresAt).getTime() - now) / 1000)) : null;

  async function confirm() {
    setError(null);
    setReceipt(null);
    try {
      const res = await convert.mutateAsync(amount);
      setReceipt({ finalUsdt: res.finalUsdt, dogeAmount: res.dogeAmount });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("convert.conversionFailedError"));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="game-panel hud-corner rounded-2xl border-mint/15 p-5">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-mint">
          ⚡ {t("convert.convertPtsLabel")}
          <InfoTooltip text={t("convert.convertPtsTooltip")} />
        </p>
        <p className="stat-value text-glow-mint mt-2 text-3xl text-mint">
          {(balances?.pts ?? 0).toLocaleString()} <span className="text-lg">PTS</span>
        </p>
        <p className="text-xs text-muted">{t("convert.availableToConvertSuffix")} · {(balances?.lifetimePaidPts ?? 0).toLocaleString()} {t("convert.earnedLifetimeSuffix")}</p>

        <label className="mt-4 block text-sm">
          <span className="mb-1 block text-muted">{t("convert.ptsAmountLabel")}</span>
          <AmountField
            value={ptsAmount}
            max={balances?.pts ?? 0}
            min={MIN_PTS_CONVERSION}
            step={100}
            onChange={setPtsAmount}
          />
        </label>

        <div className="mt-4 rounded-xl border border-line bg-panel-2 p-4 text-sm">
          <dl className="space-y-1.5">
            <div className="flex justify-between">
              <dt className="text-muted">{t("convert.convertingLabel")}</dt>
              <dd className="tabular-nums">{ptsAmount.toLocaleString()} PTS</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">{t("convert.rateLabel")}</dt>
              <dd className="tabular-nums">1,000 PTS = $1</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-1.5 font-semibold">
              <dt>{t("convert.youReceiveLabel")}</dt>
              <dd className="tabular-nums text-mint">
                ${(ptsAmount * PTS_TO_USDT_RATE).toFixed(4)} {t("dashboardHome.gameRewardUsdt")}
              </dd>
            </div>
          </dl>
        </div>

        <button
          onClick={confirmPtsConvert}
          disabled={ptsConvert.isPending || ptsAmount < MIN_PTS_CONVERSION || (balances?.pts ?? 0) < ptsAmount}
          className="btn-game hud-corner mt-4 w-full rounded-full px-4 py-2.5 text-sm"
        >
          {ptsConvert.isPending ? t("convert.convertingButton") : t("convert.confirmConversionButton")}
        </button>

        {ptsAmount < MIN_PTS_CONVERSION && (
          <p className="mt-2 text-xs text-risk">{t("convert.minConversionHint", { min: MIN_PTS_CONVERSION })}</p>
        )}
        {(balances?.pts ?? 0) < ptsAmount && ptsAmount >= MIN_PTS_CONVERSION && (
          <p className="mt-2 text-xs text-risk">{t("convert.notEnoughPtsHint")}</p>
        )}
        {ptsError && <p className="mt-2 text-xs text-risk">{ptsError}</p>}
        {ptsReceipt && (
          <p className="mt-2 text-xs text-mint">
            {t("convert.ptsConvertedMessage", { pts: ptsReceipt.ptsAmount.toLocaleString(), usdt: ptsReceipt.usdtAmount.toFixed(4) })}
          </p>
        )}

        <div className="mt-3 flex gap-2">
          <Link href="/dashboard/play" className="btn-game-outline rounded-full px-4 py-1.5 text-xs">
            {t("dashboardHome.playCoinRushButton")}
          </Link>
          <Link href="/dashboard/mining" className="btn-game-outline rounded-full px-4 py-1.5 text-xs">
            {t("nav.miningRig")}
          </Link>
        </div>
      </div>

      <div className="game-panel hud-corner rounded-2xl p-5">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gold">
          ⇄ {t("convert.convertDogeLabel")}
          <InfoTooltip text={t("convert.convertDogeTooltip")} />
        </p>
        <p className="stat-value text-glow-mint mt-2 text-3xl text-mint">
          {(balances?.availableDoge ?? 0).toFixed(6)} <span className="text-lg">DOGE</span>
        </p>
        <p className="text-xs text-muted">{t("mining.availableSuffix")}</p>

        <label className="mt-4 block text-sm">
          <span className="mb-1 block text-muted">{t("convert.dogeAmountLabel")}</span>
          <AmountField
            value={amount}
            max={balances?.availableDoge ?? 0}
            min={1}
            step={1}
            onChange={setAmount}
          />
        </label>

        <div className="mt-4 rounded-xl border border-line bg-panel-2 p-4 text-sm">
          {quoting ? (
            <p className="text-muted">{t("convert.gettingQuoteLabel")}</p>
          ) : quote ? (
            <dl className="space-y-1.5">
              <div className="flex justify-between">
                <dt className="text-muted">{t("convert.rateLabel")}</dt>
                <dd className="tabular-nums">${quote.rate.toFixed(6)} / DOGE</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">{t("convert.grossLabel")}</dt>
                <dd className="tabular-nums">${(quote.finalUsdt + quote.feeUsdt).toFixed(4)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">{t("convert.conversionFeeLabel")} ({(quote.feePct * 100).toFixed(1)}%)</dt>
                <dd className="tabular-nums text-risk">− ${quote.feeUsdt.toFixed(4)}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-1.5 font-semibold">
                <dt>{t("convert.youReceiveLabel")}</dt>
                <dd className="tabular-nums text-mint">${quote.finalUsdt.toFixed(4)} {t("wallet.recycledUsdtLabel")}</dd>
              </div>
              <div className="flex items-center justify-between pt-1">
                <p className="text-[11px] text-muted">
                  {t("convert.quoteExpiresIn", { s: secondsLeft ?? "-" })}
                </p>
                <button
                  type="button"
                  onClick={() => refetchQuote()}
                  disabled={quoteRefreshing}
                  aria-label={t("convert.refreshQuoteLabel")}
                  title={t("convert.refreshQuoteLabel")}
                  className="text-muted transition hover:text-mint disabled:opacity-50"
                >
                  <RefreshIcon spinning={quoteRefreshing} />
                </button>
              </div>
            </dl>
          ) : (
            <p className="text-muted">{t("convert.enterAmountHint")}</p>
          )}
        </div>

        <button
          onClick={confirm}
          disabled={convert.isPending || !quote || amount <= 0 || (balances?.availableDoge ?? 0) < amount}
          className="btn-game hud-corner mt-4 w-full rounded-full px-4 py-2.5 text-sm"
        >
          {convert.isPending ? t("convert.convertingButton") : t("convert.confirmConversionButton")}
        </button>

        {(balances?.availableDoge ?? 0) < amount && (
          <p className="mt-2 text-xs text-risk">{t("convert.notEnoughDogeHint")}</p>
        )}
        {error && <p className="mt-2 text-xs text-risk">{error}</p>}
        {receipt && (
          <p className="mt-2 text-xs text-mint">
            {t("convert.dogeConvertedMessage", { doge: receipt.dogeAmount, usdt: receipt.finalUsdt.toFixed(4) })}
          </p>
        )}
      </div>
    </div>
  );
}
