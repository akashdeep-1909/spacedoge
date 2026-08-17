"use client";

import Link from "next/link";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpRight, Send, UserPlus } from "lucide-react";
import { OnboardingGate } from "@/components/OnboardingGate";
import { BalanceCard } from "@/components/BalanceCard";
import { DataTable } from "@/components/DataTable";
import { InfoTooltip } from "@/components/InfoTooltip";
import { ReserveProofCard } from "@/components/wallet/ReserveProofCard";
import { useBalances, useConvertQuote, useTransactions } from "@/lib/hooks";
import { PTS_TO_USDT_RATE } from "@/lib/game-config";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { balanceTypeLabel, balanceTypeUnit } from "@/lib/balance-labels";

function fmtUsdt(n: number) {
  return `$${n.toFixed(2)}`;
}
function fmtDoge(n: number) {
  return `${n.toFixed(4)} DOGE`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function WalletPage() {
  return (
    <OnboardingGate>
      <WalletContent />
    </OnboardingGate>
  );
}

function WalletContent() {
  const { t } = useLocale();
  const { data: balances, isLoading } = useBalances();
  // Reuses the real-time DOGE/USDT convert quote (amount=1) purely to
  // read its live `rate` field — no separate rate plumbing needed.
  const { data: dogeQuote } = useConvertQuote(1);
  const { data: txData, isLoading: txLoading } = useTransactions();

  const dogeRate = dogeQuote?.rate ?? 0;
  const totalUsdValue =
    (balances?.playUsdt ?? 0) +
    (balances?.gameRewardUsdt ?? 0) +
    (balances?.recycledUsdt ?? 0) +
    (balances?.referralUsdt ?? 0) +
    (balances?.pts ?? 0) * PTS_TO_USDT_RATE +
    ((balances?.availableDoge ?? 0) + (balances?.pendingDoge ?? 0)) * dogeRate;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-glow-gold text-2xl font-black uppercase tracking-wide">{t("wallet.walletHeading")}</h2>
      </div>

      <div className="game-panel hud-corner glow-gold rounded-2xl p-6 text-center">
        <p className="flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gold">
          {t("wallet.totalBalanceLabel")}
          <InfoTooltip text={t("wallet.totalBalanceTooltip")} />
        </p>
        <p className="stat-value text-glow-gold mt-1 text-4xl text-gold">
          {isLoading ? "…" : fmtUsdt(totalUsdValue)}
        </p>
      </div>

      <section className="flex flex-wrap gap-2">
        <Link href="/dashboard/deposit" className="btn-game-outline flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs">
          <ArrowDownToLine size={13} /> {t("nav.deposit")}
        </Link>
        <Link href="/dashboard/withdraw" className="btn-game-outline flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs">
          <ArrowUpRight size={13} /> {t("nav.withdraw")}
        </Link>
        <Link href="/dashboard/convert" className="btn-game-outline flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs">
          <ArrowLeftRight size={13} /> {t("nav.convert")}
        </Link>
        <Link href="/dashboard/transfer" className="btn-game-outline flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs">
          <Send size={13} /> {t("nav.transfer")}
        </Link>
        <Link href="/dashboard/refer" className="btn-game-outline flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs">
          <UserPlus size={13} /> {t("nav.refer")}
        </Link>
      </section>

      <section>
        <h3 className="mb-3 flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.2em] text-mint">
          ▸ {t("wallet.usdtBalancesHeading")}
          <InfoTooltip text={t("wallet.usdtBalancesTooltip")} />
        </h3>
        {/* Mining Earnings and PTS deliberately swapped from a strict
            "USDT here, points/DOGE there" split — Mining Earnings sits
            as the lead card of the Mining & DOGE row below instead of
            closing out this one, and PTS closes out this row instead of
            leading the other — matches the dashboard home page's own
            layout for the same two cards. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <BalanceCard label={t("dashboardHome.playUsdt")} value={isLoading ? "…" : fmtUsdt(balances?.playUsdt ?? 0)} hint={t("dashboardHome.playUsdtHint")} />
          <BalanceCard label={t("dashboardHome.gameRewardUsdt")} value={isLoading ? "…" : fmtUsdt(balances?.gameRewardUsdt ?? 0)} tone="mint" hint={t("dashboardHome.gameRewardUsdtHint")} />
          <BalanceCard label={t("dashboardHome.referralUsdt")} value={isLoading ? "…" : fmtUsdt(balances?.referralUsdt ?? 0)} tone="mint" hint={t("dashboardHome.referralUsdtHint")} />
          <BalanceCard label={t("wallet.ptsLabel")} value={isLoading ? "…" : (balances?.pts ?? 0).toLocaleString()} hint={t("wallet.ptsHint")} />
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-mint">▸ {t("wallet.miningDogeHeading")}</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <BalanceCard label={t("wallet.recycledUsdtLabel")} value={isLoading ? "…" : fmtUsdt(balances?.recycledUsdt ?? 0)} tone="mint" hint={t("dashboardHome.recycledUsdtHint")} />
          {/* tone="mint" — Available DOGE is withdrawable/convertible,
              same as every other mint-toned card in this section (the
              system's own "mint = withdrawable" convention, see
              dashboardHome.availableDogeHint) — this previously rendered
              in the default/plain color here despite showing mint on the
              dashboard home page for the exact same balance. */}
          <BalanceCard label={t("dashboardHome.availableDoge")} value={isLoading ? "…" : fmtDoge(balances?.availableDoge ?? 0)} tone="mint" hint={t("dashboardHome.availableDogeHint")} />
          <BalanceCard label={t("dashboardHome.pendingDoge")} value={isLoading ? "…" : fmtDoge(balances?.pendingDoge ?? 0)} hint={t("dashboardHome.pendingDogeHint")} />
          <BalanceCard label={t("dashboardHome.miningPower")} value={isLoading ? "…" : `${(balances?.activeMiningPower ?? 0).toFixed(1)} MH/s`} tone="gold" hint={t("dashboardHome.miningPowerHint")} />
        </div>
      </section>

      <ReserveProofCard />

      <section>
        <h3 className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-mint">▸ {t("wallet.allTransactionsHeading")}</h3>
        {txLoading ? (
          <p className="text-sm text-muted">{t("mining.loadingLabel")}</p>
        ) : (
          <DataTable
            columns={[t("wallet.dateColumn"), t("wallet.transactionColumn"), t("wallet.balanceColumn"), t("wallet.amountColumn")]}
            empty={t("wallet.emptyTransactions")}
            rows={(txData?.rows ?? []).map((tx) => [
              <span key="date" className="text-muted">{fmtDate(tx.createdAt)}</span>,
              tx.label,
              <span key="balance" className="text-muted">{balanceTypeLabel(t, tx.balanceType)}</span>,
              <span key="amount" className={tx.amount >= 0 ? "text-mint" : "text-risk"}>
                {tx.amount >= 0 ? "+" : ""}
                {tx.amount.toFixed(tx.balanceType.includes("DOGE") ? 6 : tx.balanceType === "PTS" ? 0 : 2)}{" "}
                {balanceTypeUnit(tx.balanceType)}
              </span>,
            ])}
          />
        )}
      </section>
    </div>
  );
}
