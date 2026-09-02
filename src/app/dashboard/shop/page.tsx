"use client";

import { useState } from "react";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { OnboardingGate } from "@/components/OnboardingGate";
import { Dropdown } from "@/components/Dropdown";
import { SuccessModal } from "@/components/SuccessModal";
import {
  useBalances,
  useShopCatalog,
  useShopInventory,
  usePurchaseShopItem,
  type ShopCatalogItem,
  type OwnedShopItem,
  type FundingSource,
} from "@/lib/hooks";
import { useLocale } from "@/lib/i18n/LocaleProvider";

export default function ShopPage() {
  return (
    <OnboardingGate>
      <ShopContent />
    </OnboardingGate>
  );
}

function ShopContent() {
  const { t } = useLocale();
  const SOURCE_LABEL: Record<FundingSource, string> = {
    GAME_REWARD_USDT: t("dashboardHome.gameRewardUsdt"),
    REFERRAL_USDT: t("dashboardHome.referralUsdt"),
    PLAY_USDT: t("dashboardHome.playUsdt"),
    RECYCLED_USDT: t("wallet.recycledUsdtLabel"),
  };
  const { data: balances } = useBalances();
  const { data: catalog, isLoading: catalogLoading } = useShopCatalog();
  const { data: inventory, isLoading: inventoryLoading } = useShopInventory();
  const purchase = usePurchaseShopItem();

  const [source, setSource] = useState<FundingSource>("GAME_REWARD_USDT");
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successModal, setSuccessModal] = useState<{ title: string; rows: { label: string; value: string }[] } | null>(null);

  const balanceForSource = (s: FundingSource) =>
    s === "GAME_REWARD_USDT"
      ? balances?.gameRewardUsdt ?? 0
      : s === "REFERRAL_USDT"
      ? balances?.referralUsdt ?? 0
      : s === "PLAY_USDT"
      ? balances?.playUsdt ?? 0
      : balances?.recycledUsdt ?? 0;

  async function doPurchase(item: ShopCatalogItem) {
    setError(null);
    setBuyingId(item.id);
    try {
      await purchase.mutateAsync({ shopItemConfigId: item.id, source });
      setSuccessModal({
        title: t("shop.purchaseSuccessTitle"),
        rows: [
          { label: t("shop.priceLabel"), value: `$${item.priceUsdt.toFixed(2)}` },
          { label: t("shop.sourceLabel"), value: SOURCE_LABEL[source] },
        ],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("shop.purchaseFailed"));
    } finally {
      setBuyingId(null);
    }
  }

  const ownedConfigIds = new Set((inventory?.items ?? []).filter((i) => i.isUsable).map((i) => i.configKey));

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gold-soft text-gold">
          <ShoppingBag size={22} />
        </div>
        <div>
          <h1 className="text-glow-gold text-2xl font-black uppercase tracking-wide">{t("shop.pageTitle")}</h1>
          <p className="mt-0.5 text-sm text-muted">{t("shop.pageSubtitle")}</p>
        </div>
      </div>

      <Link
        href="/dashboard/play"
        className="btn-game-outline mt-4 inline-flex rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wide"
      >
        {t("shop.backToPlayButton")}
      </Link>

      <section className="mt-6">
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">{t("shop.myItemsTitle")}</h2>
        <div className="mt-2 flex flex-col gap-2">
          {inventoryLoading ? (
            <p className="text-sm text-muted">…</p>
          ) : (inventory?.items ?? []).length === 0 ? (
            <p className="game-panel hud-corner rounded-2xl border-line p-4 text-sm text-muted">
              {t("shop.noItemsOwned")}
            </p>
          ) : (
            (inventory?.items ?? []).map((item) => <OwnedItemRow key={item.id} item={item} />)
          )}
        </div>
      </section>

      <section className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">{t("shop.catalogTitle")}</h2>
          <div className="w-40 shrink-0">
            <Dropdown
              value={source}
              onChange={setSource}
              options={(Object.keys(SOURCE_LABEL) as FundingSource[]).map((s) => ({
                value: s,
                label: `${SOURCE_LABEL[s]} · $${balanceForSource(s).toFixed(2)}`,
              }))}
            />
          </div>
        </div>
        <div className="mt-2 flex flex-col gap-2">
          {catalogLoading ? (
            <p className="text-sm text-muted">…</p>
          ) : (
            (catalog?.items ?? []).map((item) => (
              <CatalogItemRow
                key={item.id}
                item={item}
                owned={ownedConfigIds.has(item.key)}
                buying={buyingId === item.id}
                disabled={buyingId !== null || balanceForSource(source) < item.priceUsdt}
                onBuy={() => doPurchase(item)}
              />
            ))
          )}
        </div>
      </section>

      {error && (
        <p className="game-panel hud-corner mt-4 rounded-2xl border-risk/30 p-3 text-sm text-risk">{error}</p>
      )}

      {successModal && (
        <SuccessModal title={successModal.title} rows={successModal.rows} onClose={() => setSuccessModal(null)} />
      )}
    </div>
  );
}

function OwnedItemRow({ item }: { item: OwnedShopItem }) {
  const { t } = useLocale();
  return (
    <div className="game-panel hud-corner flex items-center justify-between gap-3 rounded-2xl border-line p-3.5">
      <div>
        <p className="font-bold">{item.label}</p>
        <p className="mt-0.5 text-xs text-muted">
          {item.usesRemaining !== null
            ? t("shop.usesRemainingLabel", { uses: item.usesRemaining })
            : item.expiresAt
              ? t(item.isUsable ? "shop.expiresLabel" : "shop.expiredLabel", {
                  date: new Date(item.expiresAt).toLocaleDateString(),
                })
              : null}
        </p>
      </div>
      {!item.isUsable && (
        <span className="shrink-0 rounded-full bg-panel-2 px-2.5 py-1 text-[10px] font-bold uppercase text-muted">
          {t("shop.expiredLabel")}
        </span>
      )}
    </div>
  );
}

function CatalogItemRow({
  item,
  owned,
  buying,
  disabled,
  onBuy,
}: {
  item: ShopCatalogItem;
  owned: boolean;
  buying: boolean;
  disabled: boolean;
  onBuy: () => void;
}) {
  const { t } = useLocale();
  const pricingLabel =
    item.entitlementType === "USES"
      ? t("shop.usesPricingLabel", { uses: item.usesGranted ?? 0 })
      : t("shop.daysPricingLabel", { days: item.termDays ?? 0 });

  return (
    <div className="game-panel hud-corner flex items-center justify-between gap-3 rounded-2xl border-line p-3.5">
      <div className="min-w-0">
        <p className="font-bold">{item.label}</p>
        <p className="mt-0.5 text-xs text-muted">{item.description}</p>
        <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-gold">{pricingLabel}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <p className="stat-value text-sm">${item.priceUsdt.toFixed(2)}</p>
        {/* Non-blocking — these are consumable (N-games/time-window),
            never a one-time permanent unlock, so owning an active one
            already is never a reason to disable buying another (e.g.
            stacking more uses, or a fresh pass before the current one
            runs out). Same "purchases stack" model mining hashrate
            already uses. */}
        {owned && (
          <span className="rounded-full bg-mint-soft px-2.5 py-0.5 text-[10px] font-bold uppercase text-mint">
            {t("shop.ownedBadge")}
          </span>
        )}
        <button
          onClick={onBuy}
          disabled={disabled}
          className="btn-game hud-corner rounded-full px-4 py-1.5 text-xs disabled:opacity-50"
        >
          {buying ? t("shop.buyingButton") : t("shop.buyButton")}
        </button>
      </div>
    </div>
  );
}
