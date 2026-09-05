"use client";

import { useState } from "react";
import { OnboardingGate } from "@/components/OnboardingGate";
import { DataTable } from "@/components/DataTable";
import { InfoTooltip } from "@/components/InfoTooltip";
import { PaginationControls } from "@/components/PaginationControls";
import { usePagination } from "@/lib/usePagination";
import {
  useReferrals,
  useReferralActivity,
  type ReferralEdge,
  type KolVipTierSummary,
  type KolVipLiveProgress,
  type KolVipLastPayout,
} from "@/lib/hooks";
import { ShareSheet } from "@/components/ShareSheet";
import { copyToClipboard } from "@/lib/clipboard";
import { getPublicOrigin } from "@/lib/publicUrl";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { CHART } from "@/lib/chart-theme";

// bonusPct is stored as at most 4 decimal fraction digits (Decimal(6,4)
// in the schema), so the percentage has at most 2 decimal digits — a
// plain `bonusPct * 100` picks up JS floating-point noise on values
// like 0.07 (renders "7.000000000000001%"). Rounding at the 4th
// fractional digit's own scale (x10000, round, /100) eliminates that
// noise without losing any real precision the field can actually hold.
function pctDisplay(bonusPct: number): number {
  return Math.round(bonusPct * 10000) / 100;
}

export default function ReferPage() {
  return (
    <OnboardingGate>
      <ReferContent />
    </OnboardingGate>
  );
}

function ReferContent() {
  const { t } = useLocale();
  const STATUS_LABEL: Record<string, string> = {
    PENDING: t("refer.statusPending"),
    QUALIFIED: t("refer.statusQualified"),
    REWARDED: t("refer.statusRewarded"),
    REJECTED: t("refer.statusRejected"),
  };
  const SHARE_MESSAGE = t("refer.shareMessage");
  const { data, isLoading } = useReferrals();
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  // Lazy initializer instead of an effect — this only ever needs to
  // run once, reading a browser-only API, not "sync with an external
  // system on change." getPublicOrigin() falls back to window.location
  // when NEXT_PUBLIC_APP_URL isn't set; the typeof guard inside it just
  // keeps SSR from crashing, the client render immediately after
  // hydration has the real value.
  const [origin] = useState(() => getPublicOrigin());
  const [shareOpen, setShareOpen] = useState(false);

  const link = data && origin ? `${origin}/?ref=${data.myAddress}` : "";

  async function copy() {
    const ok = await copyToClipboard(link);
    setCopied(ok);
    setCopyError(!ok);
    setTimeout(() => {
      setCopied(false);
      setCopyError(false);
    }, 2000);
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Space DOGE", text: SHARE_MESSAGE, url: link });
        return;
      } catch {
        return; // user dismissed the native OS sheet
      }
    }
    setShareOpen(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="game-panel hud-corner rounded-2xl p-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gold">🔗 {t("refer.yourReferralLinkLabel")}</p>
        {/* Stacked on mobile — input + 2 buttons in one row overflowed
            past the card edge on real phone widths (the Share button was
            getting silently clipped off-screen). Back to one row from
            sm: up, where there's actually room for it. */}
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            readOnly
            value={link}
            className="min-w-0 flex-1 rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-muted"
          />
          <div className="flex gap-2">
            <button
              onClick={copy}
              disabled={!link}
              className="btn-game-outline flex-1 rounded-lg px-4 py-2 text-sm sm:flex-none"
            >
              {copied ? t("refer.copiedLabel") : copyError ? t("refer.couldntCopyLabel") : t("deposit.copyLabel")}
            </button>
            <button
              onClick={share}
              disabled={!link}
              className="btn-game hud-corner flex-1 rounded-lg px-4 py-2 text-sm sm:flex-none"
            >
              {t("refer.shareButton")}
            </button>
          </div>
        </div>

        {data?.referredBy && (
          <p className="mt-3 text-xs text-muted">
            {t("refer.referredByText", {
              address: `${data.referredBy.referrerAddress.slice(0, 6)}…${data.referredBy.referrerAddress.slice(-4)}`,
              status: STATUS_LABEL[data.referredBy.status] ?? data.referredBy.status,
            })}
          </p>
        )}
      </div>

      <div className="game-panel hud-corner rounded-2xl border-mint/15 p-5">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-mint">
          🏅 {t("refer.rewardsLabel")}
          <InfoTooltip text={t("refer.rewardsTooltip")} />
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-line bg-panel-2 p-4 text-sm">
            <p className="font-bold">{t("refer.level1Title", { pct: data?.l1PctOfPlatformFee ?? 5 })}</p>
            <p className="mt-1 text-muted">{t("refer.level1Body")}</p>
            <p className="stat-value text-glow-mint mt-2 text-lg text-mint">
              ${(data?.totalEarnedL1Usdt ?? 0).toFixed(2)}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-panel-2 p-4 text-sm">
            <p className="font-bold">{t("refer.level2Title", { pct: data?.l2PctOfPlatformFee ?? 2 })}</p>
            <p className="mt-1 text-muted">{t("refer.level2Body")}</p>
            <p className="stat-value text-glow-mint mt-2 text-lg text-mint">
              ${(data?.totalEarnedL2Usdt ?? 0).toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      <div className="game-panel hud-corner rounded-2xl border-gold/15 p-5">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gold">
          ⛏️ {t("refer.miningRewardsLabel")}
          <InfoTooltip text={t("refer.miningRewardsTooltip")} />
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-line bg-panel-2 p-4 text-sm">
            <p className="font-bold">{t("refer.miningLevel1Title", { pct: data?.miningL1Pct ?? 5 })}</p>
            <p className="mt-1 text-muted">{t("refer.miningLevel1Body")}</p>
            <p className="stat-value text-glow-gold mt-2 text-lg text-gold">
              {(data?.totalEarnedL1Doge ?? 0).toFixed(4)} DOGE
            </p>
          </div>
          <div className="rounded-xl border border-line bg-panel-2 p-4 text-sm">
            <p className="font-bold">{t("refer.miningLevel2Title", { pct: data?.miningL2Pct ?? 2 })}</p>
            <p className="mt-1 text-muted">{t("refer.miningLevel2Body")}</p>
            <p className="stat-value text-glow-gold mt-2 text-lg text-gold">
              {(data?.totalEarnedL2Doge ?? 0).toFixed(4)} DOGE
            </p>
          </div>
        </div>
      </div>

      {data?.kolVip.enabled && <KolVipSection kolVip={data.kolVip} />}

      <ReferralTable title={`▸ ${t("refer.directReferralsTitle")}`} rows={data?.direct} isLoading={isLoading} />
      <ReferralTable title={`▸ ${t("refer.indirectReferralsTitle")}`} rows={data?.indirect} isLoading={isLoading} />

      <CommissionActivityTable />
      <MiningCommissionActivityTable />

      {shareOpen && (
        <ShareSheet link={link} message={SHARE_MESSAGE} onClose={() => setShareOpen(false)} />
      )}
    </div>
  );
}

// The "view more" detail sheet behind the two aggregate Level 1/2
// totals above — one row per commission credit, showing which match
// earned it and whether the referred wallet won or lost that match
// (context only; commission itself is paid on entry regardless of
// result, see the Rewards InfoTooltip above).
function CommissionActivityTable() {
  const { t } = useLocale();
  const { data, isLoading } = useReferralActivity();
  const { pageItems, page, pageCount, setPage, start, pageSize, total } = usePagination(data?.rows ?? []);

  return (
    <div>
      <h2 className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-mint">
        ▸ {t("referActivity.commissionActivityHeading")}
      </h2>
      {isLoading ? (
        <p className="text-sm text-muted">{t("mining.loadingLabel")}</p>
      ) : (
        <>
          <DataTable
            columns={[
              t("wallet.dateColumn"),
              t("refer.walletColumn"),
              t("history.levelColumn"),
              t("referActivity.matchColumn"),
              t("referActivity.resultColumn"),
              t("wallet.amountColumn"),
            ]}
            empty={t("referActivity.noActivityYet")}
            rows={pageItems.map((r) => [
              new Date(r.createdAt).toLocaleDateString(),
              r.referredNickname || (r.referredAddress ? `${r.referredAddress.slice(0, 6)}…${r.referredAddress.slice(-4)}` : "-"),
              r.level,
              r.mode ?? "-",
              r.won === null ? "-" : (
                <span
                  key="result"
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
                    r.won ? "border-mint/25 bg-mint-soft text-mint" : "border-line bg-panel-2 text-muted"
                  }`}
                >
                  {r.won ? t("referActivity.winLabel") : t("referActivity.lossLabel")}
                </span>
              ),
              <span key="amount" className="text-mint">
                +${r.amount.toFixed(4)}
              </span>,
            ])}
          />
          <PaginationControls page={page} pageCount={pageCount} start={start} pageSize={pageSize} total={total} onChange={setPage} />
        </>
      )}
    </div>
  );
}

// The mining-referral counterpart to CommissionActivityTable above —
// one row per (day, level, referred wallet) DOGE credit, reconstructed
// from MiningContractAllocation on the server (see
// /api/referrals/activity's own doc-comment) since the ledger entry
// creditMiningReferralDoge actually writes is one AGGREGATED credit per
// day/level across every contributing wallet, not a per-wallet one.
function MiningCommissionActivityTable() {
  const { t } = useLocale();
  const { data, isLoading } = useReferralActivity();
  const { pageItems, page, pageCount, setPage, start, pageSize, total } = usePagination(data?.miningRows ?? []);

  return (
    <div>
      <h2 className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-gold">
        ▸ {t("referActivity.miningActivityHeading")}
      </h2>
      {isLoading ? (
        <p className="text-sm text-muted">{t("mining.loadingLabel")}</p>
      ) : (
        <>
          <DataTable
            columns={[t("wallet.dateColumn"), t("refer.walletColumn"), t("history.levelColumn"), t("wallet.amountColumn")]}
            empty={t("referActivity.noMiningActivityYet")}
            rows={pageItems.map((r) => [
              new Date(r.createdAt).toLocaleDateString(),
              r.referredAddress ? `${r.referredAddress.slice(0, 6)}…${r.referredAddress.slice(-4)}` : "-",
              r.level,
              <span key="amount" className="text-gold">
                +{r.amountDoge.toFixed(4)} DOGE
              </span>,
            ])}
          />
          <PaginationControls page={page} pageCount={pageCount} start={start} pageSize={pageSize} total={total} onChange={setPage} />
        </>
      )}
    </div>
  );
}

// Ratio-against-a-threshold meter — same visual language as
// src/app/dashboard/mining/page.tsx's own Meter (fill carries the
// value, the unfilled track is the same hue at low opacity), just
// parameterized on a raw count/target pair instead of a 0-100 pct.
function ProgressMeter({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const pct = target > 0 ? Math.max(0, Math.min(100, (value / target) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{label}</p>
        <p className="stat-value text-xs" style={{ color }}>
          {value} / {target}
        </p>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: `${color}1f` }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

const KOL_VIP_STATUS_STYLE: Record<KolVipLastPayout["status"], string> = {
  PENDING: "border-gold/30 bg-gold-soft text-gold",
  APPROVED: "border-mint/30 bg-mint-soft text-mint",
  REJECTED: "border-risk/30 bg-risk-soft text-risk",
};

// A separate monthly bonus on top of the L1/L2 rewards above — only
// rendered when an admin has turned the master switch on (src/lib/
// kolVip.ts, PlatformSettings.kolVipEnabled). liveProgress reflects the
// CURRENT, still-in-progress month (read-only, nothing paid yet);
// lastPayout is the most recent completed month that actually earned a
// tier, if any.
function KolVipSection({
  kolVip,
}: {
  kolVip: { tiers: KolVipTierSummary[]; liveProgress: KolVipLiveProgress | null; lastPayout: KolVipLastPayout | null };
}) {
  const { t } = useLocale();
  const directCount = kolVip.liveProgress?.qualifiedDirectCount ?? 0;
  const indirectCount = kolVip.liveProgress?.qualifiedIndirectCount ?? 0;
  // nextTierLabel only carries a display string — cross-referencing the
  // tier ladder by label recovers the actual thresholds the progress
  // meters below need.
  const nextTier = kolVip.tiers.find((tier) => tier.label === kolVip.liveProgress?.nextTierLabel);
  const statusLabel: Record<KolVipLastPayout["status"], string> = {
    PENDING: t("refer.kolVipStatusPending"),
    APPROVED: t("refer.kolVipStatusApproved"),
    REJECTED: t("refer.kolVipStatusRejected"),
  };

  return (
    <div className="game-panel hud-corner rounded-2xl border-gold/15 p-5">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gold">
        👑 {t("refer.kolVipLabel")}
        <InfoTooltip text={t("refer.kolVipTooltip")} />
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {/* This Month So Far */}
        <div className="rounded-xl border border-line bg-panel-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-foreground">{t("refer.kolVipThisMonthTitle")}</p>
            <span
              className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                kolVip.liveProgress?.currentTierLabel ? "border-gold/30 bg-gold-soft text-gold" : "border-line bg-panel text-muted"
              }`}
            >
              {kolVip.liveProgress?.currentTierLabel
                ? t("refer.kolVipCurrentTierLabel", { tier: kolVip.liveProgress.currentTierLabel })
                : t("refer.kolVipNotQualified")}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-line bg-panel px-3 py-2">
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted">{t("refer.kolVipDirectStatLabel")}</p>
              <p className="stat-value text-glow-gold mt-0.5 text-lg text-gold">{directCount}</p>
            </div>
            <div className="rounded-lg border border-line bg-panel px-3 py-2">
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted">{t("refer.kolVipIndirectStatLabel")}</p>
              <p className="stat-value text-glow-gold mt-0.5 text-lg text-gold">{indirectCount}</p>
            </div>
          </div>

          {nextTier ? (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                {t("refer.kolVipProgressToNext", { tier: nextTier.label })}
              </p>
              <ProgressMeter label={t("refer.kolVipColDirect")} value={directCount} target={nextTier.minDirectReferrals} color={CHART.gold} />
              <ProgressMeter label={t("refer.kolVipColIndirect")} value={indirectCount} target={nextTier.minIndirectReferrals} color={CHART.mint} />
            </div>
          ) : (
            kolVip.liveProgress?.currentTierLabel && (
              <p className="mt-3 text-xs font-semibold text-gold">
                {t("refer.kolVipMaxTierReached", { tier: kolVip.liveProgress.currentTierLabel })}
              </p>
            )
          )}
        </div>

        {/* Last Month's Reward */}
        <div className="rounded-xl border border-line bg-panel-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-foreground">{t("refer.kolVipLastPayoutTitle")}</p>
            {kolVip.lastPayout && (
              <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${KOL_VIP_STATUS_STYLE[kolVip.lastPayout.status]}`}>
                {statusLabel[kolVip.lastPayout.status]}
              </span>
            )}
          </div>

          {kolVip.lastPayout ? (
            <>
              <p className="mt-1 text-xs text-muted">
                {kolVip.lastPayout.periodMonth} · {kolVip.lastPayout.tierLabel}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-line bg-panel px-3 py-2">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-muted">{t("refer.kolVipUsdtStatLabel")}</p>
                  <p className="stat-value text-glow-mint mt-0.5 text-lg text-mint">${kolVip.lastPayout.bonusUsdt.toFixed(4)}</p>
                </div>
                <div className="rounded-lg border border-line bg-panel px-3 py-2">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-muted">{t("refer.kolVipHashrateStatLabel")}</p>
                  <p className="stat-value text-glow-gold mt-0.5 text-lg text-gold">{kolVip.lastPayout.bonusHashrateMhs.toFixed(2)} MH/s</p>
                </div>
              </div>
              {kolVip.lastPayout.status === "PENDING" && <p className="mt-2 text-[11px] text-muted">{t("refer.kolVipPendingNote")}</p>}
              {kolVip.lastPayout.status === "REJECTED" && <p className="mt-2 text-[11px] text-risk">{t("refer.kolVipRejectedNote")}</p>}
            </>
          ) : (
            <p className="mt-3 text-xs text-muted">{t("refer.kolVipNoPayoutYet")}</p>
          )}
        </div>
      </div>

      {kolVip.tiers.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted">{t("refer.kolVipTierLadderTitle")}</p>
          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gold/15 bg-panel-2 text-left text-[10px] uppercase tracking-widest text-gold">
                  <th className="whitespace-nowrap px-3 py-2 font-bold">{t("refer.kolVipColTier")}</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-bold">{t("refer.kolVipColDirect")}</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-bold">{t("refer.kolVipColIndirect")}</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-bold">{t("refer.kolVipColBonus")}</th>
                </tr>
              </thead>
              <tbody>
                {kolVip.tiers.map((tier) => {
                  const isCurrent = tier.label === kolVip.liveProgress?.currentTierLabel;
                  const isNext = tier.label === kolVip.liveProgress?.nextTierLabel;
                  return (
                    <tr
                      key={tier.key}
                      className={`border-b border-line last:border-0 ${isCurrent ? "bg-gold-soft" : "bg-panel"}`}
                    >
                      <td className="stat-value whitespace-nowrap px-3 py-2 text-[13px]">
                        <span className={isCurrent ? "font-bold text-gold" : "text-foreground"}>{tier.label}</span>
                        {isCurrent && (
                          <span className="ml-1.5 rounded-full border border-gold/30 bg-panel px-1.5 py-0.5 text-[9px] font-bold uppercase text-gold">
                            {t("refer.kolVipCurrentRowTag")}
                          </span>
                        )}
                        {!isCurrent && isNext && (
                          <span className="ml-1.5 rounded-full border border-line bg-panel px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted">
                            {t("refer.kolVipNextRowTag")}
                          </span>
                        )}
                      </td>
                      <td className="stat-value whitespace-nowrap px-3 py-2 text-right text-[13px] text-muted">{tier.minDirectReferrals}</td>
                      <td className="stat-value whitespace-nowrap px-3 py-2 text-right text-[13px] text-muted">{tier.minIndirectReferrals}</td>
                      <td className="stat-value whitespace-nowrap px-3 py-2 text-right text-[13px] font-bold text-gold">
                        {pctDisplay(tier.bonusPct)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ReferralTable({
  title,
  rows,
  isLoading,
}: {
  title: string;
  rows: ReferralEdge[] | undefined;
  isLoading: boolean;
}) {
  const { t } = useLocale();
  const STATUS_LABEL: Record<string, string> = {
    PENDING: t("refer.statusPending"),
    QUALIFIED: t("refer.statusQualified"),
    REWARDED: t("refer.statusRewarded"),
    REJECTED: t("refer.statusRejected"),
  };
  return (
    <div>
      <h2 className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-gold">{title}</h2>
      {isLoading ? (
        <p className="text-sm text-muted">{t("mining.loadingLabel")}</p>
      ) : (
        <DataTable
          columns={[t("refer.walletColumn"), t("refer.statusColumn"), t("refer.joinedColumn")]}
          empty={t("refer.nobodyHereYet")}
          rows={(rows ?? []).map((r) => [
            `${r.address.slice(0, 6)}…${r.address.slice(-4)}`,
            STATUS_LABEL[r.status] ?? r.status,
            new Date(r.createdAt).toLocaleDateString(),
          ])}
        />
      )}
    </div>
  );
}
