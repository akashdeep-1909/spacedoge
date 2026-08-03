"use client";

import { use } from "react";
import Link from "next/link";
import { OnboardingGate } from "@/components/OnboardingGate";
import { InfoTooltip } from "@/components/InfoTooltip";
import { useWithdrawalDetail } from "@/lib/hooks";
import { useLocale } from "@/lib/i18n/LocaleProvider";

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Row({ field, children }: { field: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-line px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{field}</p>
      <div className="text-sm font-medium">{children}</div>
    </div>
  );
}

export default function WithdrawalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <OnboardingGate>
      <WithdrawalDetailContent id={id} />
    </OnboardingGate>
  );
}

function WithdrawalDetailContent({ id }: { id: string }) {
  const { t } = useLocale();
  const SOURCE_LABEL: Record<string, string> = {
    PLAY_USDT: t("dashboardHome.playUsdt"),
    RECYCLED_USDT: t("wallet.recycledUsdtLabel"),
    REFERRAL_USDT: t("dashboardHome.referralUsdt"),
    AVAILABLE_DOGE: t("dashboardHome.availableDoge"),
  };
  const { data, isLoading, error } = useWithdrawalDetail(id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/dashboard/history" className="text-xs text-muted underline">
          {t("withdraw.backToHistoryLink")}
        </Link>
        <h2 className="text-glow-gold mt-2 flex items-center gap-1.5 text-2xl font-black uppercase tracking-wide">
          {t("withdraw.detailsTitle")}
          <InfoTooltip text={t("withdraw.detailsTooltip")} />
        </h2>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">{t("mining.loadingLabel")}</p>
      ) : error || !data ? (
        <p className="text-sm text-risk">{error instanceof Error ? error.message : t("withdraw.notFoundError")}</p>
      ) : (
        <>
          <div
            className={`rounded-2xl border px-4 py-3 text-xs ${
              data.status === "COMPLETED"
                ? "border-mint/25 bg-mint-soft text-mint"
                : "border-gold/25 bg-gold-soft text-gold"
            }`}
          >
            {data.status === "COMPLETED"
              ? t("withdraw.completedNotice")
              : t("withdraw.pendingNotice")}
          </div>

          <div className="game-panel hud-corner overflow-hidden rounded-2xl">
            <Row field={t("withdraw.statusField")}>
              <span
                className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${
                  data.status === "COMPLETED"
                    ? "border-mint/25 bg-mint-soft text-mint"
                    : "border-gold/25 bg-gold-soft text-gold"
                }`}
              >
                {data.status}
              </span>
            </Row>
            <Row field={t("withdraw.coinLabel")}>{data.coinSymbol}</Row>
            <Row field={t("withdraw.networkLabel")}>{data.chainLabel}</Row>
            <Row field={t("withdraw.sourceBalanceLabel")}>{SOURCE_LABEL[data.source] ?? data.source}</Row>
            <Row field={t("withdraw.addressField")}>
              <span className="break-all font-mono text-xs">{data.destinationAddress}</span>
            </Row>
            <Row field={t("withdraw.amountRequestedField")}>
              <span className="stat-value text-base">
                {data.amount.toFixed(data.coinSymbol === "DOGE" ? 4 : 2)} {data.coinSymbol}
              </span>
            </Row>
            <Row field={t("withdraw.networkFeeField")}>
              {data.networkFeeUsdt !== null ? (
                <span className="text-risk">
                  − {data.networkFeeUsdt.toFixed(data.coinSymbol === "DOGE" ? 4 : 2)} {data.coinSymbol}
                </span>
              ) : (
                <span className="text-muted">{t("withdraw.feeDependsHint")}</span>
              )}
            </Row>
            <Row field={t("withdraw.amountSentField")}>
              {data.networkFeeUsdt !== null ? (
                <span className="stat-value text-glow-mint text-base text-mint">
                  {(data.amount - data.networkFeeUsdt).toFixed(data.coinSymbol === "DOGE" ? 4 : 2)} {data.coinSymbol}
                </span>
              ) : (
                <span className="text-muted">{t("withdraw.amountSentPendingHint")}</span>
              )}
            </Row>
            <Row field={t("withdraw.requestedField")}>{fmtDateTime(data.createdAt)}</Row>
            {data.completedAt && <Row field={t("withdraw.completedField")}>{fmtDateTime(data.completedAt)}</Row>}
            <Row field={t("withdraw.blockchainHashField")}>
              {data.status === "COMPLETED" && data.txHash ? (
                data.explorerUrl ? (
                  <a
                    href={data.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all font-mono text-xs text-mint underline"
                  >
                    {data.txHash}
                  </a>
                ) : (
                  <span className="break-all font-mono text-xs">{data.txHash}</span>
                )
              ) : (
                <span className="text-muted">{t("withdraw.notSentYet")}</span>
              )}
            </Row>
          </div>
        </>
      )}
    </div>
  );
}
