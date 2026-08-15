"use client";

import { useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { OnboardingGate } from "@/components/OnboardingGate";
import { BalanceCard } from "@/components/BalanceCard";
import { Dropdown } from "@/components/Dropdown";
import { AmountField } from "@/components/AmountField";
import { DataTable } from "@/components/DataTable";
import { useBalances, useSendTransfer, useTransactions, type TransferableBalanceType } from "@/lib/hooks";
import { useLocale } from "@/lib/i18n/LocaleProvider";

const ALL_BALANCE_TYPES: TransferableBalanceType[] = ["PLAY_USDT", "GAME_REWARD_USDT", "RECYCLED_USDT", "REFERRAL_USDT"];

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

// Reason code a same-wallet moveBalance() ledger pair is tagged with
// (src/lib/transfers.ts's own BALANCE_TRANSFER_REASON) — kept as a
// plain string literal here rather than importing it, same reasoning
// as TransferableBalanceType in hooks.ts: that file is server-only and
// pulls in the Prisma/pg driver, this is a "use client" page. Used to
// filter the shared /api/wallet/transactions feed down to just this
// page's own history, excluding every other ledger reason (deposits,
// match entries, mining payouts, etc.) that feed shows too.
const BALANCE_TRANSFER_REASON = "balance_transfer";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TransferContent() {
  const { t } = useLocale();
  const BALANCE_LABEL: Record<TransferableBalanceType, string> = {
    PLAY_USDT: t("dashboardHome.playUsdt"),
    GAME_REWARD_USDT: t("dashboardHome.gameRewardUsdt"),
    RECYCLED_USDT: t("wallet.recycledUsdtLabel"),
    REFERRAL_USDT: t("dashboardHome.referralUsdt"),
  };
  const { data: balances } = useBalances();
  const send = useSendTransfer();
  const { data: txData } = useTransactions();
  const transferRows = (txData?.rows ?? []).filter((r) => r.reason === BALANCE_TRANSFER_REASON);

  const [fromBalanceType, setFromBalanceType] = useState<TransferableBalanceType>("PLAY_USDT");
  const [toBalanceType, setToBalanceType] = useState<TransferableBalanceType>("RECYCLED_USDT");
  const [amount, setAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ amount: number; fromBalanceType: TransferableBalanceType; toBalanceType: TransferableBalanceType } | null>(null);

  const balanceFor = (b: TransferableBalanceType) =>
    b === "PLAY_USDT"
      ? balances?.playUsdt ?? 0
      : b === "GAME_REWARD_USDT"
        ? balances?.gameRewardUsdt ?? 0
        : b === "RECYCLED_USDT"
          ? balances?.recycledUsdt ?? 0
          : balances?.referralUsdt ?? 0;
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

  // Swaps which balance is the source and which is the destination —
  // both are already independently valid selections (fromOptions/
  // toOptions each just exclude whatever the OTHER dropdown currently
  // holds), so trading them is always safe, no re-validation needed.
  function swapFromTo() {
    setFromBalanceType(toBalanceType);
    setToBalanceType(fromBalanceType);
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <BalanceCard label={t("dashboardHome.playUsdt")} value={fmtUsdt(balances?.playUsdt ?? 0)} />
          <BalanceCard label={t("dashboardHome.gameRewardUsdt")} value={fmtUsdt(balances?.gameRewardUsdt ?? 0)} tone="mint" />
          <BalanceCard label={t("wallet.recycledUsdtLabel")} value={fmtUsdt(balances?.recycledUsdt ?? 0)} tone="mint" />
          <BalanceCard label={t("dashboardHome.referralUsdt")} value={fmtUsdt(balances?.referralUsdt ?? 0)} tone="mint" />
        </div>
      </section>

      <section className="game-panel hud-corner rounded-2xl p-5">
        <h3 className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-gold">▸ {t("transfer.sendHeading")}</h3>
        <div className="flex flex-col gap-3">
          {/* From/To grouped in their own relative wrapper with the
              swap button ABSOLUTELY positioned at its exact vertical
              center, instead of living in its own flex row between
              them — a plain flex-gap row put the button at the
              midpoint between the two BLOCKS (label + dropdown each),
              which read as off-center in practice: the "From" block
              ends right at its dropdown's bottom edge, but the "To"
              block starts with its own label above the dropdown, so
              the button sat visibly closer to one box than the other
              (confirmed live via a real screenshot). Centering on the
              wrapper's own midpoint instead lands exactly on the seam
              between the two — since both blocks share the identical
              label+dropdown structure, that midpoint IS the seam,
              regardless of exactly how wide/tall "From"/"To" render in
              any given language. */}
          <div className="relative flex flex-col gap-4">
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
            <button
              type="button"
              onClick={swapFromTo}
              aria-label={t("transfer.swapAria")}
              title={t("transfer.swapAria")}
              className="btn-game-outline absolute left-1/2 top-1/2 z-10 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-panel-2 p-0"
            >
              <ArrowUpDown size={15} />
            </button>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">
              {t("transfer.amountLabel")} ({fmtUsdt(available)} {t("mining.availableSuffix")})
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

      {/* Sending to another user is disabled for now (a deliberate
          product decision, not a technical limitation — the underlying
          useSendToUser/useResolveRecipient hooks and /api/wallet/
          transfer-to-user route are untouched, just not wired into this
          page's UI). This history table takes its place: every real
          same-wallet move, newest first, reusing the same combined
          ledger feed the Wallet page's own transaction list draws from
          (see /api/wallet/transactions), filtered down to just the
          "balance_transfer" reason so deposits/matches/mining payouts/
          etc. from that same feed don't show up here. */}
      <section>
        <h3 className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-gold">▸ {t("transfer.historyHeading")}</h3>
        <DataTable
          columns={[t("wallet.dateColumn"), t("wallet.transactionColumn"), t("wallet.balanceColumn"), t("wallet.amountColumn")]}
          empty={t("transfer.historyEmpty")}
          pageSize={10}
          rows={transferRows.map((tx) => [
            <span key="date" className="text-muted">{fmtDate(tx.createdAt)}</span>,
            tx.label,
            <span key="balance" className="text-muted">{BALANCE_LABEL[tx.balanceType as TransferableBalanceType] ?? tx.balanceType}</span>,
            <span key="amount" className="text-mint">
              +{tx.amount.toFixed(2)}
            </span>,
          ])}
        />
      </section>
    </div>
  );
}
