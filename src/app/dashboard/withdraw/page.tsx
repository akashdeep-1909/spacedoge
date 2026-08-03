"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { OnboardingGate } from "@/components/OnboardingGate";
import { Dropdown } from "@/components/Dropdown";
import { AmountField } from "@/components/AmountField";
import { PaginationControls } from "@/components/PaginationControls";
import { usePagination } from "@/lib/usePagination";
import { useBalances, useWithdraw, usePublicSettings, useWithdrawalHistory, type WithdrawSource } from "@/lib/hooks";
import { isValidAddressForRegex } from "@/lib/withdrawals";
import { coinIcon, chainIcon } from "@/components/icons/CoinIcons";
import { useLocale } from "@/lib/i18n/LocaleProvider";

const FALLBACK_MIN_USDT_WITHDRAWAL = 5;

const STATUS_STYLE: Record<string, string> = {
  PENDING: "border-gold/25 bg-gold-soft text-gold",
  COMPLETED: "border-mint/25 bg-mint-soft text-mint",
};

export default function WithdrawPage() {
  return (
    <OnboardingGate>
      <WithdrawContent />
    </OnboardingGate>
  );
}

function WithdrawContent() {
  const { t } = useLocale();
  const SOURCE_LABEL: Record<WithdrawSource, string> = {
    RECYCLED_USDT: t("wallet.recycledUsdtLabel"),
    REFERRAL_USDT: t("dashboardHome.referralUsdt"),
  };
  const { data: balances } = useBalances();
  const { data: publicSettings } = usePublicSettings();
  const { data: history } = useWithdrawalHistory();
  const historyPage = usePagination(history?.rows ?? []);
  const withdraw = useWithdraw();
  const withdrawChains = publicSettings?.withdrawChains ?? [];
  // Coins in the order they first appear among enabled chains — e.g.
  // ["USDT", "DOGE"] — the coin tab picks WHICH SET of chains is
  // selectable below, kept as its own control rather than folded into
  // one combined "chain (coin)" dropdown.
  const coins = Array.from(new Set(withdrawChains.map((c) => c.coinSymbol)));

  const [coinSymbol, setCoinSymbol] = useState<"USDT" | "DOGE" | null>(null);
  const [chainKey, setChainKey] = useState<string | null>(null);
  const [source, setSource] = useState<WithdrawSource>("RECYCLED_USDT");
  const [amount, setAmount] = useState(FALLBACK_MIN_USDT_WITHDRAWAL);
  const [amountTouched, setAmountTouched] = useState(false);
  const [destinationAddress, setDestinationAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{
    id: string;
    source: WithdrawSource | "AVAILABLE_DOGE";
    amount: number;
    chain: string;
    coinSymbol: "USDT" | "DOGE";
    remainingBalance: number;
  } | null>(null);

  useEffect(() => {
    if (!coinSymbol && coins.length > 0) setCoinSymbol(coins[0]);
  }, [coins, coinSymbol]);

  const chainsForCoin = withdrawChains.filter((c) => c.coinSymbol === coinSymbol);

  useEffect(() => {
    if (chainsForCoin.length === 0) return;
    if (!chainKey || !chainsForCoin.some((c) => c.chainKey === chainKey)) {
      setChainKey(chainsForCoin[0].chainKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coinSymbol, withdrawChains]);

  const selectedChain = withdrawChains.find((c) => c.chainKey === chainKey) ?? null;
  const isDoge = coinSymbol === "DOGE";
  const minWithdrawal = isDoge
    ? publicSettings?.minDogeWithdrawal ?? 50
    : publicSettings?.minUsdtWithdrawal ?? FALLBACK_MIN_USDT_WITHDRAWAL;

  // Once the real admin-configured minimum (or the selected coin) loads
  // or changes, snap the still-untouched default amount to it — avoids
  // a stale fallback value silently sitting below (or above) the real
  // minimum after an admin changes it or the user switches coins.
  useEffect(() => {
    if (!amountTouched) setAmount(minWithdrawal);
  }, [minWithdrawal, amountTouched]);

  const balanceFor = (s: WithdrawSource) => (s === "RECYCLED_USDT" ? balances?.recycledUsdt ?? 0 : balances?.referralUsdt ?? 0);
  const available = isDoge ? balances?.availableDoge ?? 0 : balanceFor(source);
  const addressLooksValid =
    destinationAddress.trim().length > 0 && !!selectedChain && isValidAddressForRegex(destinationAddress, selectedChain.addressRegex);

  async function confirm() {
    if (!selectedChain) return;
    setError(null);
    try {
      const res = await withdraw.mutateAsync({
        source: isDoge ? undefined : source,
        amount,
        destinationAddress,
        chain: selectedChain.chainKey,
      });
      setReceipt({
        id: res.id,
        source: res.source,
        amount: res.amount,
        chain: res.chain,
        coinSymbol: selectedChain.coinSymbol,
        remainingBalance: available - res.amount,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("withdraw.withdrawalFailedError"));
    }
  }

  const sourceLabel = isDoge ? t("dashboardHome.availableDoge") : SOURCE_LABEL[source];
  const amountLabel = isDoge ? amount.toFixed(4) : amount.toFixed(2);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-gold/25 bg-gold-soft px-4 py-3 text-xs text-gold">
        {t("withdraw.manualNoticeBody")}
      </div>

      <div className="rounded-2xl border border-mint/25 bg-mint-soft px-4 py-3 text-xs text-mint">
        {t("withdraw.gameRewardLockedNotice")}
      </div>

      <div className="game-panel hud-corner rounded-2xl p-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gold">↗ {t("withdraw.withdrawLabel")}</p>

        <div className="mt-4">
          <span className="mb-1 block text-sm text-muted">{t("withdraw.coinLabel")}</span>
          <div className="flex flex-wrap gap-2">
            {coins.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setCoinSymbol(c);
                  setAmountTouched(false);
                }}
                className={`flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                  coinSymbol === c ? "border-gold bg-gold-soft text-gold" : "border-line bg-panel text-muted"
                }`}
              >
                {coinIcon(c)} {c}
              </button>
            ))}
          </div>
        </div>

        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-muted">{t("withdraw.networkLabel")}</span>
          <Dropdown
            value={chainKey ?? ""}
            onChange={(v) => {
              setChainKey(v);
              setAmountTouched(false);
            }}
            options={chainsForCoin.map((c) => ({
              value: c.chainKey,
              label: (
                <span className="flex items-center gap-1.5">
                  {chainIcon(c.chainKey)} {c.label}
                </span>
              ),
            }))}
          />
        </label>

        {!isDoge && (
          <label className="mt-3 block text-sm">
            <span className="mb-1 block text-muted">{t("withdraw.sourceBalanceLabel")}</span>
            <Dropdown
              value={source}
              onChange={setSource}
              options={(Object.keys(SOURCE_LABEL) as WithdrawSource[]).map((s) => ({
                value: s,
                label: `${SOURCE_LABEL[s]} (${t("withdraw.availableMinHint", { amount: `$${balanceFor(s).toFixed(2)}`, min: `$${minWithdrawal}` })})`,
              }))}
            />
          </label>
        )}

        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-muted">{t("withdraw.amountLabel")} ({coinSymbol ?? "…"})</span>
          <AmountField
            value={amount}
            max={available}
            min={minWithdrawal}
            step={isDoge ? 0.0001 : 0.01}
            onChange={(v) => {
              setAmountTouched(true);
              setAmount(v);
            }}
          />
          {isDoge && <span className="mt-1 block text-[11px] text-muted">{t("withdraw.dogeAvailableMinHint", { available: available.toFixed(4), min: minWithdrawal })}</span>}
        </label>

        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-muted">{t("withdraw.withdrawalAddressLabel")}</span>
          <input
            type="text"
            value={destinationAddress}
            onChange={(e) => setDestinationAddress(e.target.value)}
            placeholder={coinSymbol === "DOGE" ? "D…" : selectedChain?.chainKey === "TRC20" ? "T…" : "0x…"}
            className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 font-mono text-sm"
          />
        </label>

        <button
          onClick={confirm}
          disabled={withdraw.isPending || !selectedChain || amount < minWithdrawal || amount > available || !addressLooksValid}
          className="btn-game hud-corner mt-4 w-full rounded-full px-4 py-2.5 text-sm"
        >
          {withdraw.isPending ? t("withdraw.requestingButton") : `${t("withdraw.withdrawLabel")} ${amountLabel} ${coinSymbol ?? ""}`}
        </button>

        {amount > available && <p className="mt-2 text-xs text-risk">{t("withdraw.notEnoughBalanceHint", { source: sourceLabel })}</p>}
        {destinationAddress.trim().length > 0 && !addressLooksValid && (
          <p className="mt-2 text-xs text-risk">{t("withdraw.invalidAddressHint", { chain: selectedChain?.label ?? "" })}</p>
        )}
        {error && <p className="mt-2 text-xs text-risk">{error}</p>}
      </div>

      <div>
        <h2 className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-gold">▸ {t("withdraw.recentWithdrawalsHeading")}</h2>
        <div className="game-panel hud-corner overflow-hidden rounded-2xl">
          {!history?.rows.length ? (
            <p className="p-5 text-sm text-muted">{t("withdraw.noWithdrawalsYet")}</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {historyPage.pageItems.map((w) => {
                  const rowIsDoge = w.source === "AVAILABLE_DOGE";
                  return (
                    <tr key={w.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLE[w.status]}`}>
                          {w.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {w.amount.toFixed(rowIsDoge ? 4 : 2)} {rowIsDoge ? "DOGE" : "USDT"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        <span className="flex items-center gap-1.5">{chainIcon(w.chain, 14)} {w.chain}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">{new Date(w.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/dashboard/withdraw/${w.id}`} className="text-xs text-mint underline">
                          {t("withdraw.detailsLink")}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <PaginationControls
          page={historyPage.page}
          pageCount={historyPage.pageCount}
          start={historyPage.start}
          pageSize={historyPage.pageSize}
          total={historyPage.total}
          onChange={historyPage.setPage}
        />
      </div>

      {receipt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setReceipt(null)}
        >
          <div
            className="game-panel hud-corner w-full max-w-sm rounded-2xl p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-3xl">✅</p>
            <h3 className="text-glow-mint mt-2 text-lg font-black uppercase tracking-wide text-mint">
              {t("withdraw.withdrawalRequestedTitle")}
            </h3>
            <p className="mt-2 text-sm text-muted">
              {t("withdraw.withdrawalRequestedBody", {
                amount: receipt.amount.toFixed(receipt.coinSymbol === "DOGE" ? 4 : 2),
                coin: receipt.coinSymbol,
                source: receipt.source === "AVAILABLE_DOGE" ? t("dashboardHome.availableDoge") : SOURCE_LABEL[receipt.source],
                chain: receipt.chain,
              })}
            </p>
            <div className="mt-4 rounded-xl border border-line bg-panel-2 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted">
                {t("withdraw.remainingBalanceLabel", {
                  source: receipt.source === "AVAILABLE_DOGE" ? t("dashboardHome.availableDoge") : SOURCE_LABEL[receipt.source],
                })}
              </p>
              <p className="stat-value mt-1 text-xl text-mint">
                {receipt.remainingBalance.toFixed(receipt.coinSymbol === "DOGE" ? 4 : 2)} {receipt.coinSymbol}
              </p>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Link
                href={`/dashboard/withdraw/${receipt.id}`}
                className="btn-game-outline hud-corner rounded-full px-4 py-2 text-sm"
              >
                {t("withdraw.viewDetailsButton")}
              </Link>
              <button
                onClick={() => setReceipt(null)}
                className="rounded-full px-4 py-2 text-xs text-muted hover:text-foreground"
              >
                {t("withdraw.closeButton")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
