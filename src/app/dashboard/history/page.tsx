"use client";

import { useState } from "react";
import Link from "next/link";
import { OnboardingGate } from "@/components/OnboardingGate";
import { DataTable } from "@/components/DataTable";
import {
  useGameHistory,
  useMiningHistory,
  useConversionHistory,
  useWithdrawalHistory,
  useReferrals,
} from "@/lib/hooks";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { balanceTypeLabel } from "@/lib/balance-labels";

type Tab = "game" | "mining" | "conversion" | "withdrawals" | "referrals";

const TAB_KEYS: { key: Tab; labelKey: "history.gameTab" | "history.miningTab" | "history.conversionTab" | "history.withdrawalsTab" | "history.referralsTab" }[] = [
  { key: "game", labelKey: "history.gameTab" },
  { key: "mining", labelKey: "history.miningTab" },
  { key: "conversion", labelKey: "history.conversionTab" },
  { key: "withdrawals", labelKey: "history.withdrawalsTab" },
  { key: "referrals", labelKey: "history.referralsTab" },
];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}


export default function HistoryPage() {
  return (
    <OnboardingGate>
      <HistoryContent />
    </OnboardingGate>
  );
}

function HistoryContent() {
  const { t } = useLocale();
  const [tab, setTab] = useState<Tab>("game");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-glow-gold text-2xl font-black uppercase tracking-wide">{t("history.historyHeading")}</h2>
        <p className="mt-1 text-sm text-muted">
          {t("history.historySubtitle")}
        </p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-full border border-line bg-panel p-1 text-xs w-fit">
        {TAB_KEYS.map((tabItem) => (
          <button
            key={tabItem.key}
            onClick={() => setTab(tabItem.key)}
            className={`rounded-full px-3.5 py-1.5 font-black uppercase tracking-wide transition ${
              tab === tabItem.key ? "btn-game" : "text-muted hover:text-gold"
            }`}
          >
            {t(tabItem.labelKey)}
          </button>
        ))}
      </div>

      {tab === "game" && <GameTab />}
      {tab === "mining" && <MiningTab />}
      {tab === "conversion" && <ConversionTab />}
      {tab === "withdrawals" && <WithdrawalsTab />}
      {tab === "referrals" && <ReferralsTab />}
    </div>
  );
}

function GameTab() {
  const { t } = useLocale();
  const { data, isLoading } = useGameHistory();
  if (isLoading) return <p className="text-sm text-muted">{t("mining.loadingLabel")}</p>;
  return (
    <DataTable
      columns={[t("wallet.dateColumn"), t("history.modeColumn"), t("refer.statusColumn"), t("play.scoreLabel"), t("play.rankLabel"), t("history.rewardColumn")]}
      empty={t("history.noMatchesYet")}
      rows={(data?.rows ?? []).map((r) => [
        fmtDate(r.createdAt),
        r.mode,
        r.status,
        r.score,
        r.rank ?? "—",
        <div key="reward">
          <div>${r.rewardUsdt.toFixed(2)}</div>
          {r.bonusPts > 0 && (
            <div className="text-[10px] font-normal text-mint">
              {r.score} + {r.bonusPts} bonus = {r.rewardPts} PTS
            </div>
          )}
        </div>,
      ])}
    />
  );
}

function MiningTab() {
  const { t } = useLocale();
  const { data, isLoading } = useMiningHistory();
  if (isLoading) return <p className="text-sm text-muted">{t("mining.loadingLabel")}</p>;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="mb-2 text-xs font-black uppercase tracking-[0.15em] text-mint">
          {t("history.contractsHeading")}
        </h3>
        <DataTable
          columns={[t("wallet.dateColumn"), t("history.sourceColumn"), t("history.levelColumn"), t("history.mhsColumn"), t("history.termColumn"), t("history.priceColumn"), t("history.expiresColumn")]}
          empty={t("history.noContractsYet")}
          rows={(data?.contracts ?? []).map((c) => [
            fmtDate(c.createdAt),
            c.source,
            c.level,
            c.miningPower.toFixed(1),
            `${c.termDays}d`,
            `$${c.pricePaidUsdt.toFixed(2)}`,
            fmtDate(c.expiresAt),
          ])}
        />
      </div>
      <div>
        <h3 className="mb-2 text-xs font-black uppercase tracking-[0.15em] text-mint">
          {t("history.dailyEpochHeading")}
        </h3>
        <DataTable
          columns={[t("history.epochColumn"), t("history.effectiveMhsColumn"), t("history.dogeAllocatedColumn")]}
          empty={t("history.noEpochAllocationsYet")}
          rows={(data?.allocations ?? []).map((a) => [
            fmtDate(a.epochDate),
            a.effectiveMp.toFixed(1),
            a.dogeAllocated.toFixed(6),
          ])}
        />
      </div>
    </div>
  );
}

function ConversionTab() {
  const { t } = useLocale();
  const { data, isLoading } = useConversionHistory();
  if (isLoading) return <p className="text-sm text-muted">{t("mining.loadingLabel")}</p>;
  return (
    <DataTable
      columns={[t("wallet.dateColumn"), t("wallet.balanceColumn"), t("wallet.amountColumn")]}
      empty={t("history.noConversionsYet")}
      rows={(data?.rows ?? []).map((r) => [
        fmtDate(r.createdAt),
        balanceTypeLabel(t, r.balanceType),
        `${r.amount > 0 ? "+" : ""}${r.amount.toFixed(6)}`,
      ])}
    />
  );
}

function WithdrawalsTab() {
  const { t } = useLocale();
  const { data, isLoading } = useWithdrawalHistory();
  if (isLoading) return <p className="text-sm text-muted">{t("mining.loadingLabel")}</p>;
  return (
    <DataTable
      columns={[t("wallet.dateColumn"), t("history.sourceColumn"), t("wallet.amountColumn"), t("refer.statusColumn"), t("withdraw.detailsLink")]}
      empty={t("withdraw.noWithdrawalsYet")}
      rows={(data?.rows ?? []).map((r) => [
        fmtDate(r.createdAt),
        r.source,
        `$${r.amount.toFixed(2)}`,
        <span
          key="status"
          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
            r.status === "COMPLETED" ? "border-mint/25 bg-mint-soft text-mint" : "border-gold/25 bg-gold-soft text-gold"
          }`}
        >
          {r.status}
        </span>,
        <Link key="details" href={`/dashboard/withdraw/${r.id}`} className="text-mint underline">
          {t("history.detailsArrowLink")}
        </Link>,
      ])}
    />
  );
}

function ReferralsTab() {
  const { t } = useLocale();
  const { data, isLoading } = useReferrals();
  if (isLoading) return <p className="text-sm text-muted">{t("mining.loadingLabel")}</p>;
  const rows = [
    ...(data?.direct ?? []).map((r) => ({ ...r, level: t("history.l1DirectLabel") })),
    ...(data?.indirect ?? []).map((r) => ({ ...r, level: t("history.l2IndirectLabel") })),
  ];
  return (
    <DataTable
      columns={[t("refer.walletColumn"), t("history.levelColumn"), t("refer.statusColumn"), t("refer.joinedColumn")]}
      empty={t("history.noReferralsYet")}
      rows={rows.map((r) => [
        `${r.address.slice(0, 6)}…${r.address.slice(-4)}`,
        r.level,
        r.status,
        fmtDate(r.createdAt),
      ])}
    />
  );
}
