"use client";

import { useState } from "react";
import Link from "next/link";
import { Gamepad2, Pickaxe, ArrowLeftRight, ArrowUpRight, UserPlus, History as HistoryIcon, Loader2 } from "lucide-react";
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
import type { TranslationKey } from "@/lib/i18n/LocaleProvider";
import { balanceTypeLabel, balanceTypeUnit } from "@/lib/balance-labels";
import { GAME_MODE_CONFIG } from "@/lib/game-config";
import { RIG_DISPLAY_NAME } from "@/lib/mining-shared";
import { chainIcon } from "@/components/icons/CoinIcons";
import type { GameMode } from "@/generated/prisma/enums";

type Tab = "game" | "mining" | "conversion" | "withdrawals" | "referrals";
type Tone = "mint" | "gold" | "muted" | "risk";
type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

const TAB_KEYS: {
  key: Tab;
  labelKey: "history.gameTab" | "history.miningTab" | "history.conversionTab" | "history.withdrawalsTab" | "history.referralsTab";
  Icon: typeof Gamepad2;
}[] = [
  { key: "game", labelKey: "history.gameTab", Icon: Gamepad2 },
  { key: "mining", labelKey: "history.miningTab", Icon: Pickaxe },
  { key: "conversion", labelKey: "history.conversionTab", Icon: ArrowLeftRight },
  { key: "withdrawals", labelKey: "history.withdrawalsTab", Icon: ArrowUpRight },
  { key: "referrals", labelKey: "history.referralsTab", Icon: UserPlus },
];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Shared colored badge for every status column below — same
// rounded-full/border/uppercase treatment the Withdrawals tab already
// used inline for PENDING/COMPLETED, now reused everywhere a raw
// enum value would otherwise leak straight to the user.
const TONE_CLASS: Record<Tone, string> = {
  mint: "border-mint/25 bg-mint-soft text-mint",
  gold: "border-gold/25 bg-gold-soft text-gold",
  muted: "border-line text-muted",
  risk: "border-risk/40 bg-risk-soft text-risk",
};
function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  return <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${TONE_CLASS[tone]}`}>{label}</span>;
}

// MatchStatus alone doesn't say win/loss for a multiplayer ("SETTLED")
// room — each participant's own reward does, so that case is derived
// from rewardUsdt instead of the raw enum, same as every other status
// display on this page already reads off real data rather than the
// enum's SCREAMING_SNAKE name.
function matchStatusInfo(t: TFn, status: string, rewardUsdt: number): { label: string; tone: Tone } {
  switch (status) {
    case "SETTLED_WIN":
      return { label: t("history.statusWin"), tone: "mint" };
    case "SETTLED_LOSS":
      return { label: t("history.statusLoss"), tone: "muted" };
    case "SETTLED":
      return rewardUsdt > 0 ? { label: t("history.statusWin"), tone: "mint" } : { label: t("history.statusLoss"), tone: "muted" };
    case "IN_MATCH":
      return { label: t("history.statusInProgress"), tone: "gold" };
    case "RESERVED":
      return { label: t("history.statusReserved"), tone: "muted" };
    case "PROVISIONAL":
      return { label: t("history.statusProcessing"), tone: "gold" };
    case "CANCELLED":
      return { label: t("history.statusCancelled"), tone: "risk" };
    case "UNDER_REVIEW":
      return { label: t("history.statusUnderReview"), tone: "gold" };
    default:
      return { label: status, tone: "muted" };
  }
}

// Same labels the Refer page's own STATUS_LABEL map already uses —
// reused here instead of duplicated so the two pages can never drift.
function referralStatusInfo(t: TFn, status: string): { label: string; tone: Tone } {
  switch (status) {
    case "PENDING":
      return { label: t("refer.statusPending"), tone: "gold" };
    case "QUALIFIED":
      return { label: t("refer.statusQualified"), tone: "mint" };
    case "REWARDED":
      return { label: t("refer.statusRewarded"), tone: "mint" };
    case "REJECTED":
      return { label: t("refer.statusRejected"), tone: "risk" };
    default:
      return { label: status, tone: "muted" };
  }
}

function gameModeLabel(mode: string): string {
  return GAME_MODE_CONFIG[mode as GameMode]?.label ?? mode;
}

function Right({ children }: { children: React.ReactNode }) {
  return <div className="text-right tabular-nums">{children}</div>;
}

function LoadingPanel({ t }: { t: TFn }) {
  return (
    <div className="game-panel hud-corner flex items-center justify-center gap-2 rounded-2xl p-8 text-sm text-muted">
      <Loader2 size={16} className="animate-spin" />
      {t("mining.loadingLabel")}
    </div>
  );
}

// Every tab's table gets the same small heading + live row count above
// it — the pagination summary at the bottom of DataTable only appears
// once a list actually spans more than one page, so short lists (a
// handful of referrals, one withdrawal) otherwise had no indication of
// "how many" at all.
function SectionHeading({ t, label, count }: { t: TFn; label: string; count: number }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-xs font-black uppercase tracking-[0.15em] text-mint">▸ {label}</h3>
      <span className="text-[11px] text-muted">{t("history.totalCountLabel", { count })}</span>
    </div>
  );
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
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-gold/30 bg-gold-soft">
          <HistoryIcon size={20} className="text-gold" strokeWidth={1.75} />
        </div>
        <div>
          <h2 className="text-glow-gold text-2xl font-black uppercase tracking-wide">{t("history.historyHeading")}</h2>
          <p className="mt-1 text-sm text-muted">{t("history.historySubtitle")}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 rounded-full border border-line bg-panel p-1 text-xs w-fit">
        {TAB_KEYS.map((tabItem) => (
          <button
            key={tabItem.key}
            onClick={() => setTab(tabItem.key)}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-black uppercase tracking-wide transition ${
              tab === tabItem.key ? "btn-game" : "text-muted hover:text-gold"
            }`}
          >
            <tabItem.Icon size={13} className="shrink-0" strokeWidth={2.25} />
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
  if (isLoading) return <LoadingPanel t={t} />;
  const rows = data?.rows ?? [];
  return (
    <div>
      <SectionHeading t={t} label={t("history.gameTab")} count={rows.length} />
      <DataTable
        columns={[t("wallet.dateColumn"), t("history.modeColumn"), t("refer.statusColumn"), t("play.scoreLabel"), t("play.rankLabel"), t("history.rewardColumn")]}
        empty={t("history.noMatchesYet")}
        rows={rows.map((r) => {
          const status = matchStatusInfo(t, r.status, r.rewardUsdt);
          return [
            <span key="date" className="text-muted">{fmtDate(r.createdAt)}</span>,
            gameModeLabel(r.mode),
            <StatusPill key="status" label={status.label} tone={status.tone} />,
            <Right key="score">{r.score}</Right>,
            <Right key="rank">{r.rank ? `#${r.rank}` : "—"}</Right>,
            <div key="reward" className="text-right">
              <div className={r.rewardUsdt > 0 ? "text-mint" : ""}>${r.rewardUsdt.toFixed(2)}</div>
              {r.bonusPts > 0 && (
                <div className="text-[10px] font-normal text-muted">
                  {r.score} + {r.bonusPts} bonus = {r.rewardPts} PTS
                </div>
              )}
            </div>,
          ];
        })}
      />
    </div>
  );
}

function MiningTab() {
  const { t } = useLocale();
  const { data, isLoading } = useMiningHistory();
  if (isLoading) return <LoadingPanel t={t} />;
  const contracts = data?.contracts ?? [];
  const allocations = data?.allocations ?? [];
  return (
    <div className="flex flex-col gap-6">
      <div>
        <SectionHeading t={t} label={t("history.contractsHeading")} count={contracts.length} />
        <DataTable
          columns={[t("wallet.dateColumn"), t("history.sourceColumn"), t("history.levelColumn"), t("history.mhsColumn"), t("history.termColumn"), t("history.priceColumn"), t("history.expiresColumn")]}
          empty={t("history.noContractsYet")}
          rows={contracts.map((c) => [
            <span key="date" className="text-muted">{fmtDate(c.createdAt)}</span>,
            c.source,
            RIG_DISPLAY_NAME[c.level as keyof typeof RIG_DISPLAY_NAME] ?? c.level,
            <Right key="mhs">{c.miningPower.toFixed(1)}</Right>,
            <Right key="term">{`${c.termDays}d`}</Right>,
            <Right key="price">{`$${c.pricePaidUsdt.toFixed(2)}`}</Right>,
            <span key="expires" className="text-muted">{fmtDate(c.expiresAt)}</span>,
          ])}
        />
      </div>
      <div>
        <SectionHeading t={t} label={t("history.dailyEpochHeading")} count={allocations.length} />
        <DataTable
          columns={[t("history.epochColumn"), t("history.effectiveMhsColumn"), t("history.dogeAllocatedColumn")]}
          empty={t("history.noEpochAllocationsYet")}
          rows={allocations.map((a) => [
            <span key="epoch" className="text-muted">{fmtDate(a.epochDate)}</span>,
            <Right key="mhs">{a.effectiveMp.toFixed(1)}</Right>,
            <Right key="doge"><span className="text-mint">{a.dogeAllocated.toFixed(6)}</span></Right>,
          ])}
        />
      </div>
    </div>
  );
}

function ConversionTab() {
  const { t } = useLocale();
  const { data, isLoading } = useConversionHistory();
  if (isLoading) return <LoadingPanel t={t} />;
  const rows = data?.rows ?? [];
  return (
    <div>
      <SectionHeading t={t} label={t("history.conversionTab")} count={rows.length} />
      <DataTable
        columns={[t("wallet.dateColumn"), t("wallet.balanceColumn"), t("wallet.amountColumn")]}
        empty={t("history.noConversionsYet")}
        rows={rows.map((r) => [
          <span key="date" className="text-muted">{fmtDate(r.createdAt)}</span>,
          <span key="balance" className="text-muted">{balanceTypeLabel(t, r.balanceType)}</span>,
          <Right key="amount">
            <span className={r.amount >= 0 ? "text-mint" : "text-risk"}>
              {r.amount >= 0 ? "+" : ""}
              {r.amount.toFixed(6)} {balanceTypeUnit(r.balanceType)}
            </span>
          </Right>,
        ])}
      />
    </div>
  );
}

function WithdrawalsTab() {
  const { t } = useLocale();
  const { data, isLoading } = useWithdrawalHistory();
  if (isLoading) return <LoadingPanel t={t} />;
  const rows = data?.rows ?? [];
  return (
    <div>
      <SectionHeading t={t} label={t("history.withdrawalsTab")} count={rows.length} />
      <DataTable
        columns={[t("wallet.dateColumn"), t("history.sourceColumn"), t("history.chainColumn"), t("wallet.amountColumn"), t("refer.statusColumn"), t("withdraw.detailsLink")]}
        empty={t("withdraw.noWithdrawalsYet")}
        rows={rows.map((r) => {
          const status = r.status === "COMPLETED" ? { label: t("history.statusCompleted"), tone: "mint" as Tone } : { label: t("history.statusPending"), tone: "gold" as Tone };
          return [
            <span key="date" className="text-muted">{fmtDate(r.createdAt)}</span>,
            balanceTypeLabel(t, r.source),
            <span key="chain" className="inline-flex items-center gap-1.5">
              {chainIcon(r.chain, 14)}
              {r.chain}
            </span>,
            <Right key="amount">
              {r.amount.toFixed(balanceTypeUnit(r.source) === "DOGE" ? 4 : 2)} {balanceTypeUnit(r.source)}
            </Right>,
            <StatusPill key="status" label={status.label} tone={status.tone} />,
            <Link key="details" href={`/dashboard/withdraw/${r.id}`} className="text-mint underline">
              {t("history.detailsArrowLink")}
            </Link>,
          ];
        })}
      />
    </div>
  );
}

function ReferralsTab() {
  const { t } = useLocale();
  const { data, isLoading } = useReferrals();
  if (isLoading) return <LoadingPanel t={t} />;
  const rows = [
    ...(data?.direct ?? []).map((r) => ({ ...r, level: t("history.l1DirectLabel") })),
    ...(data?.indirect ?? []).map((r) => ({ ...r, level: t("history.l2IndirectLabel") })),
  ];
  return (
    <div>
      <SectionHeading t={t} label={t("history.referralsTab")} count={rows.length} />
      <DataTable
        columns={[t("refer.walletColumn"), t("history.levelColumn"), t("refer.statusColumn"), t("refer.joinedColumn")]}
        empty={t("history.noReferralsYet")}
        rows={rows.map((r) => {
          const status = referralStatusInfo(t, r.status);
          return [
            <span key="address" className="font-mono">{`${r.address.slice(0, 6)}…${r.address.slice(-4)}`}</span>,
            r.level,
            <StatusPill key="status" label={status.label} tone={status.tone} />,
            <span key="joined" className="text-muted">{fmtDate(r.createdAt)}</span>,
          ];
        })}
      />
    </div>
  );
}
