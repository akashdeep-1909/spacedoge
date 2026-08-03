"use client";

import { useState } from "react";
import { OnboardingGate } from "@/components/OnboardingGate";
import { BalanceCard } from "@/components/BalanceCard";
import { Dropdown } from "@/components/Dropdown";
import { AmountField } from "@/components/AmountField";
import { useBalances, useSendTransfer, type TransferableBalanceType } from "@/lib/hooks";
import { useLocale } from "@/lib/i18n/LocaleProvider";

const ALL_BALANCE_TYPES: TransferableBalanceType[] = ["PLAY_USDT", "RECYCLED_USDT", "REFERRAL_USDT"];

function fmtUsdt(n: number) {
  return `$${n.toFixed(2)}`;
}

export default function TransferPage() {
  return (
    <OnboardingGate>
      <TransferContent />
    </OnboardingGate>
  );
}

function TransferContent() {
  const { t } = useLocale();
  const BALANCE_LABEL: Record<TransferableBalanceType, string> = {
    PLAY_USDT: t("dashboardHome.playUsdt"),
    RECYCLED_USDT: t("wallet.recycledUsdtLabel"),
    REFERRAL_USDT: t("dashboardHome.referralUsdt"),
  };
  const { data: balances } = useBalances();
  const send = useSendTransfer();

  const [fromBalanceType, setFromBalanceType] = useState<TransferableBalanceType>("PLAY_USDT");
  const [toBalanceType, setToBalanceType] = useState<TransferableBalanceType>("RECYCLED_USDT");
  const [amount, setAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ amount: number; fromBalanceType: TransferableBalanceType; toBalanceType: TransferableBalanceType } | null>(null);

  const balanceFor = (b: TransferableBalanceType) =>
    b === "PLAY_USDT" ? balances?.playUsdt ?? 0 : b === "RECYCLED_USDT" ? balances?.recycledUsdt ?? 0 : balances?.referralUsdt ?? 0;
  const available = balanceFor(fromBalanceType);
  const fromOptions = ALL_BALANCE_TYPES.filter((b) => b !== toBalanceType);
  const toOptions = ALL_BALANCE_TYPES.filter((b) => b !== fromBalanceType);

  function handleFromChange(next: TransferableBalanceType) {
    setFromBalanceType(next);
    if (next === toBalanceType) {
      setToBalanceType(ALL_BALANCE_TYPES.find((b) => b !== next) ?? next);
    }
  }

  function handleToChange(next: TransferableBalanceType) {
    setToBalanceType(next);
    if (next === fromBalanceType) {
      setFromBalanceType(ALL_BALANCE_TYPES.find((b) => b !== next) ?? next);
    }
  }

  async function submit() {
    setError(null);
    setSuccess(null);
    try {
      await send.mutateAsync({ fromBalanceType, toBalanceType, amount });
      setSuccess({ amount, fromBalanceType, toBalanceType });
      setAmount(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("transfer.failedGeneric"));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-glow-gold text-2xl font-black uppercase tracking-wide">{t("transfer.heading")}</h2>
      </div>

      <section>
        <h3 className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-mint">▸ {t("transfer.balancesHeading")}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <BalanceCard label={t("dashboardHome.playUsdt")} value={fmtUsdt(balances?.playUsdt ?? 0)} />
          <BalanceCard label={t("wallet.recycledUsdtLabel")} value={fmtUsdt(balances?.recycledUsdt ?? 0)} tone="mint" />
          <BalanceCard label={t("dashboardHome.referralUsdt")} value={fmtUsdt(balances?.referralUsdt ?? 0)} tone="mint" />
        </div>
      </section>

      <section className="game-panel hud-corner rounded-2xl p-5">
        <h3 className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-gold">▸ {t("transfer.sendHeading")}</h3>
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted">{t("transfer.fromLabel")}</label>
            <Dropdown
              value={fromBalanceType}
              onChange={handleFromChange}
              options={fromOptions.map((b) => ({
                value: b,
                label: `${BALANCE_LABEL[b]} (${fmtUsdt(balanceFor(b))} ${t("mining.availableSuffix")})`,
              }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">{t("transfer.toLabel")}</label>
            <Dropdown
              value={toBalanceType}
              onChange={handleToChange}
              options={toOptions.map((b) => ({
                value: b,
                label: BALANCE_LABEL[b],
              }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">
              {t("transfer.amountLabel")} — {fmtUsdt(available)} {t("mining.availableSuffix")}
            </label>
            <AmountField value={amount} max={available} onChange={setAmount} />
          </div>
          <button
            onClick={submit}
            disabled={send.isPending || amount <= 0 || amount > available}
            className="btn-game hud-corner mt-1 rounded-full px-5 py-2.5 text-sm disabled:opacity-50"
          >
            {send.isPending ? t("transfer.sendingButton") : t("transfer.sendButton")}
          </button>
          {error && <p className="text-xs text-risk">{error}</p>}
          {success && (
            <p className="text-xs text-mint">
              {t("transfer.successMessage", {
                amount: fmtUsdt(success.amount),
                from: BALANCE_LABEL[success.fromBalanceType],
                to: BALANCE_LABEL[success.toBalanceType],
              })}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
