"use client";

import { useState } from "react";
import { OnboardingGate } from "@/components/OnboardingGate";
import { DataTable } from "@/components/DataTable";
import { InfoTooltip } from "@/components/InfoTooltip";
import { PaginationControls } from "@/components/PaginationControls";
import { usePagination } from "@/lib/usePagination";
import { useReferrals, useReferralActivity, type ReferralEdge } from "@/lib/hooks";
import { ShareSheet } from "@/components/ShareSheet";
import { copyToClipboard } from "@/lib/clipboard";
import { getPublicOrigin } from "@/lib/publicUrl";
import { useLocale } from "@/lib/i18n/LocaleProvider";

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

      <ReferralTable title={`▸ ${t("refer.directReferralsTitle")}`} rows={data?.direct} isLoading={isLoading} />
      <ReferralTable title={`▸ ${t("refer.indirectReferralsTitle")}`} rows={data?.indirect} isLoading={isLoading} />

      <CommissionActivityTable />

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
              r.referredNickname || (r.referredAddress ? `${r.referredAddress.slice(0, 6)}…${r.referredAddress.slice(-4)}` : "—"),
              r.level,
              r.mode ?? "—",
              r.won === null ? "—" : (
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
