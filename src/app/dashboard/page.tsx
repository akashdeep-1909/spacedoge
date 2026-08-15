"use client";

import Link from "next/link";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpRight, Gamepad2, Pickaxe, UserPlus } from "lucide-react";
import { OnboardingGate } from "@/components/OnboardingGate";
import { BalanceCard } from "@/components/BalanceCard";
import { DashboardHero } from "@/components/DashboardHero";
import { useBalances, useMiningProof } from "@/lib/hooks";
import { levelDisplayNameWithPlus } from "@/lib/mining-shared";
import { useLocale } from "@/lib/i18n/LocaleProvider";

function fmtUsdt(n: number) {
  return `$${n.toFixed(2)}`;
}
function fmtDoge(n: number) {
  return `${n.toFixed(4)} DOGE`;
}

export default function DashboardPage() {
  return (
    <OnboardingGate>
      <DashboardContent />
    </OnboardingGate>
  );
}

function DashboardContent() {
  const { t } = useLocale();
  const { data: balances, isLoading } = useBalances();
  const { data: proof } = useMiningProof();

  return (
    <div className="flex flex-col gap-6">
      <DashboardHero />

      <section>
        <h2 className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-gold">
          ⬢ {t("dashboardHome.balancesHeading")}
        </h2>
        {/* Every balance the system actually tracks (see WalletBalances),
            not a partial subset — this used to omit PTS and Mining
            Earnings entirely, so a wallet holding either saw no trace of
            it here despite both showing up on the full Wallet page.
            Grouped and toned to match that page exactly: USDT balances
            first (mint = withdrawable, plain = restricted — Play USDT is
            the only one still plain now that Game Reward USDT is
            withdrawable too, see /api/wallet/withdraw), then points/DOGE.
            Mining Earnings and PTS deliberately sit in the position
            adjacent to the OTHER section (Mining Earnings last in the
            USDT row, PTS first in the points/DOGE row) rather than each
            grouped strictly with its own balance-type row — matches the
            Wallet page's own layout. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <BalanceCard
            label={t("dashboardHome.playUsdt")}
            value={isLoading ? "…" : fmtUsdt(balances?.playUsdt ?? 0)}
            hint={t("dashboardHome.playUsdtHint")}
          />
          <BalanceCard
            label={t("dashboardHome.gameRewardUsdt")}
            value={isLoading ? "…" : fmtUsdt(balances?.gameRewardUsdt ?? 0)}
            tone="mint"
            hint={t("dashboardHome.gameRewardUsdtHint")}
          />
          <BalanceCard
            label={t("dashboardHome.referralUsdt")}
            value={isLoading ? "…" : fmtUsdt(balances?.referralUsdt ?? 0)}
            tone="mint"
            hint={t("dashboardHome.referralUsdtHint")}
          />
          <BalanceCard
            label={t("wallet.ptsLabel")}
            value={isLoading ? "…" : (balances?.pts ?? 0).toLocaleString()}
            hint={t("wallet.ptsHint")}
          />
          <BalanceCard
            label={t("wallet.recycledUsdtLabel")}
            value={isLoading ? "…" : fmtUsdt(balances?.recycledUsdt ?? 0)}
            tone="mint"
            hint={t("dashboardHome.recycledUsdtHint")}
          />
          <BalanceCard
            label={t("dashboardHome.availableDoge")}
            value={isLoading ? "…" : fmtDoge(balances?.availableDoge ?? 0)}
            tone="mint"
            hint={t("dashboardHome.availableDogeHint")}
          />
          <BalanceCard
            label={t("dashboardHome.pendingDoge")}
            value={isLoading ? "…" : fmtDoge(balances?.pendingDoge ?? 0)}
            hint={t("dashboardHome.pendingDogeHint")}
          />
          <BalanceCard
            label={t("dashboardHome.miningPower")}
            value={isLoading ? "…" : `${(balances?.activeMiningPower ?? 0).toFixed(1)} MH/s`}
            tone="gold"
            hint={t("dashboardHome.miningPowerHint")}
          />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="game-panel hud-corner rounded-2xl p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gold">▸ {t("dashboardHome.primaryActionLabel")}</p>
          <h3 className="mt-1 text-lg font-bold">{t("dashboardHome.playCoinRushTitle")}</h3>
          <p className="mt-1 text-sm text-muted">
            {t("dashboardHome.playCoinRushBody")}
          </p>
          <Link
            href="/dashboard/play"
            className="btn-game hud-corner mt-4 inline-block rounded-full px-5 py-2.5 text-sm"
          >
            {t("dashboardHome.playCoinRushButton")}
          </Link>
        </div>

        <div className="game-panel hud-corner rounded-2xl border-mint/15 p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-mint">⛏ {t("dashboardHome.miningLabel")}</p>
          <h3 className="mt-1 text-lg font-bold">
            {proof?.hasContract
              ? `${levelDisplayNameWithPlus(proof.level ?? "", proof.miningPower ?? 0)} active`
              : t("dashboardHome.miningNoRig")}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {proof?.hasContract
              ? `${proof.miningPower?.toFixed(1)} MH/s, expires ${new Date(proof.expiresAt!).toLocaleDateString()}`
              : proof?.activated
                ? t("dashboardHome.miningBuyHashrate")
                : t("dashboardHome.miningActivateHint")}
          </p>
          <Link
            href="/dashboard/mining"
            className="btn-game-outline mt-4 inline-block rounded-full px-5 py-2.5 text-sm"
          >
            {t("dashboardHome.miningButton")}
          </Link>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-mint">▸ {t("dashboardHome.actionsHeading")}</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/deposit" className="btn-game-outline flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs">
            <ArrowDownToLine size={13} /> {t("nav.deposit")}
          </Link>
          <Link href="/dashboard/play" className="btn-game-outline flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs">
            <Gamepad2 size={13} /> {t("nav.play")}
          </Link>
          <Link href="/dashboard/mining" className="btn-game-outline flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs">
            <Pickaxe size={13} /> {t("dashboardHome.actionActivatePower")}
          </Link>
          <Link href="/dashboard/convert" className="btn-game-outline flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs">
            <ArrowLeftRight size={13} /> {t("nav.convert")}
          </Link>
          <Link href="/dashboard/withdraw" className="btn-game-outline flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs">
            <ArrowUpRight size={13} /> {t("nav.withdraw")}
          </Link>
          <Link href="/dashboard/refer" className="btn-game-outline flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs">
            <UserPlus size={13} /> {t("nav.refer")}
          </Link>
        </div>
      </section>
    </div>
  );
}
