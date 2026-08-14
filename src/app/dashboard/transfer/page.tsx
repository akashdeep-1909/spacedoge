"use client";

import { useState } from "react";
import { OnboardingGate } from "@/components/OnboardingGate";
import { BalanceCard } from "@/components/BalanceCard";
import { Dropdown } from "@/components/Dropdown";
import { AmountField } from "@/components/AmountField";
import {
  useBalances,
  useSendTransfer,
  useResolveRecipient,
  useSendToUser,
  type TransferableBalanceType,
  type TransferableToOtherUserBalanceType,
  type ResolvedRecipient,
} from "@/lib/hooks";
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
  const SEND_TO_USER_LABEL: Record<TransferableToOtherUserBalanceType, string> = {
    RECYCLED_USDT: t("wallet.recycledUsdtLabel"),
    REFERRAL_USDT: t("dashboardHome.referralUsdt"),
  };
  const SEND_TO_USER_BALANCE_TYPES: TransferableToOtherUserBalanceType[] = ["RECYCLED_USDT", "REFERRAL_USDT"];
  const { data: balances } = useBalances();
  const send = useSendTransfer();
  const resolveRecipient = useResolveRecipient();
  const sendToUser = useSendToUser();

  const [fromBalanceType, setFromBalanceType] = useState<TransferableBalanceType>("PLAY_USDT");
  const [toBalanceType, setToBalanceType] = useState<TransferableBalanceType>("RECYCLED_USDT");
  const [amount, setAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ amount: number; fromBalanceType: TransferableBalanceType; toBalanceType: TransferableBalanceType } | null>(null);

  const [recipientAddress, setRecipientAddress] = useState("");
  const [resolvedRecipient, setResolvedRecipient] = useState<ResolvedRecipient | null>(null);
  const [sendToUserBalanceType, setSendToUserBalanceType] = useState<TransferableToOtherUserBalanceType>("RECYCLED_USDT");
  const [sendToUserAmount, setSendToUserAmount] = useState(0);
  const [note, setNote] = useState("");
  const [userTransferSuccess, setUserTransferSuccess] = useState<{ amount: number; recipient: string } | null>(null);

  const sendToUserBalanceFor = (b: TransferableToOtherUserBalanceType) =>
    b === "RECYCLED_USDT" ? balances?.recycledUsdt ?? 0 : balances?.referralUsdt ?? 0;
  const sendToUserAvailable = sendToUserBalanceFor(sendToUserBalanceType);

  function handleRecipientAddressChange(next: string) {
    setRecipientAddress(next);
    setResolvedRecipient(null);
    resolveRecipient.reset();
    setUserTransferSuccess(null);
  }

  async function lookupRecipient() {
    setUserTransferSuccess(null);
    try {
      const recipient = await resolveRecipient.mutateAsync(recipientAddress.trim());
      setResolvedRecipient(recipient);
    } catch {
      setResolvedRecipient(null);
    }
  }

  async function submitSendToUser() {
    if (!resolvedRecipient) return;
    setUserTransferSuccess(null);
    try {
      await sendToUser.mutateAsync({
        toAddress: resolvedRecipient.address,
        balanceType: sendToUserBalanceType,
        amount: sendToUserAmount,
        note: note.trim() || undefined,
      });
      setUserTransferSuccess({
        amount: sendToUserAmount,
        recipient: resolvedRecipient.nickname || resolvedRecipient.address,
      });
      setSendToUserAmount(0);
      setNote("");
      setRecipientAddress("");
      setResolvedRecipient(null);
    } catch {
      // sendToUser's own error state (sendToUser.error) is rendered below — nothing else to do here.
    }
  }

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

      <section className="game-panel hud-corner rounded-2xl p-5">
        <h3 className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-gold">▸ {t("transfer.sendToUserHeading")}</h3>
        <p className="mb-3 text-xs text-muted">{t("transfer.sendToUserBody")}</p>
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted">{t("transfer.recipientLabel")}</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={recipientAddress}
                onChange={(e) => handleRecipientAddressChange(e.target.value)}
                placeholder={t("transfer.recipientPlaceholder")}
                className="w-full rounded-lg border border-line bg-panel px-3 py-2 font-mono text-sm"
              />
              <button
                onClick={lookupRecipient}
                disabled={resolveRecipient.isPending || !recipientAddress.trim() || Boolean(resolvedRecipient)}
                className="btn-game-outline shrink-0 rounded-full px-4 py-2 text-xs disabled:opacity-50"
              >
                {resolveRecipient.isPending ? t("transfer.lookingUpButton") : t("transfer.lookupButton")}
              </button>
            </div>
            {resolveRecipient.isError && (
              <p className="mt-1 text-xs text-risk">{resolveRecipient.error instanceof Error ? resolveRecipient.error.message : t("transfer.failedGeneric")}</p>
            )}
            {resolvedRecipient && (
              <p className="mt-1 text-xs text-mint">
                {t("transfer.recipientFoundLabel", { recipient: resolvedRecipient.nickname || resolvedRecipient.address })}
              </p>
            )}
          </div>

          {resolvedRecipient && (
            <>
              <div>
                <label className="mb-1 block text-xs text-muted">{t("transfer.fromLabel")}</label>
                <Dropdown
                  value={sendToUserBalanceType}
                  onChange={setSendToUserBalanceType}
                  options={SEND_TO_USER_BALANCE_TYPES.map((b) => ({
                    value: b,
                    label: `${SEND_TO_USER_LABEL[b]} (${fmtUsdt(sendToUserBalanceFor(b))} ${t("mining.availableSuffix")})`,
                  }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">
                  {t("transfer.amountLabel")} ({fmtUsdt(sendToUserAvailable)} {t("mining.availableSuffix")})
                </label>
                <AmountField value={sendToUserAmount} max={sendToUserAvailable} onChange={setSendToUserAmount} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">{t("transfer.noteLabel")}</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t("transfer.notePlaceholder")}
                  maxLength={140}
                  className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm"
                />
              </div>
              <p className="text-xs text-gold">⚠ {t("transfer.sendToUserWarning")}</p>
              <button
                onClick={submitSendToUser}
                disabled={sendToUser.isPending || sendToUserAmount <= 0 || sendToUserAmount > sendToUserAvailable}
                className="btn-game hud-corner mt-1 rounded-full px-5 py-2.5 text-sm disabled:opacity-50"
              >
                {sendToUser.isPending ? t("transfer.confirmSendingButton") : t("transfer.confirmSendButton")}
              </button>
              {sendToUser.isError && (
                <p className="text-xs text-risk">{sendToUser.error instanceof Error ? sendToUser.error.message : t("transfer.failedGeneric")}</p>
              )}
            </>
          )}

          {userTransferSuccess && (
            <p className="text-xs text-mint">
              {t("transfer.sendToUserSuccessMessage", { amount: fmtUsdt(userTransferSuccess.amount), recipient: userTransferSuccess.recipient })}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
