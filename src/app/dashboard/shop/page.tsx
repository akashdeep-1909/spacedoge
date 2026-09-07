"use client";

import { useState } from "react";
import Link from "next/link";
import { ShoppingBag, Check, Lock } from "lucide-react";
import { OnboardingGate } from "@/components/OnboardingGate";
import { SuccessModal } from "@/components/SuccessModal";
import { RocketPreview } from "@/components/game/RocketPreview";
import { ShopItemIcon } from "@/components/game/ShopItemIcon";
import {
  useBalances,
  useShopCatalog,
  useShopInventory,
  usePurchaseShopItem,
  type ShopCatalogItem,
  type OwnedShopItem,
  type FundingSource,
} from "@/lib/hooks";
import { SHOP_CATEGORY_META, shopItemEffectSummaryKey, type ShopItemCategory } from "@/lib/shop-shared";
import { useLocale } from "@/lib/i18n/LocaleProvider";

// A distinct, consistent ship color for a ROCKET_SHAPE item that has no
// colorHex of its own (older catalog rows created before that field
// existed) — deliberately NOT per-mode theme.shipColor (CoinRushArena
// picks that per game mode, meaningless here). Every real rocket item
// going forward carries its own admin-set colorHex instead.
const PREVIEW_COLOR = "#f4c15d";

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
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gold-soft text-gold">
          <ShoppingBag size={24} />
        </div>
        <div className="min-w-0">
          <h1 className="text-glow-gold text-2xl font-black uppercase tracking-wide">{t("shop.pageTitle")}</h1>
          <p className="mt-0.5 text-sm text-muted">{t("shop.pageSubtitle")}</p>
        </div>
        <Link
          href="/dashboard/play"
          className="btn-game-outline ml-auto hidden shrink-0 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wide sm:inline-flex"
        >
          {t("shop.backToPlayButton")}
        </Link>
      </div>
      <Link
        href="/dashboard/play"
        className="btn-game-outline -mt-2 inline-flex w-fit shrink-0 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wide sm:hidden"
      >
        {t("shop.backToPlayButton")}
      </Link>

      {/* Wallets — tapping a balance selects it as the payment source
          for every Buy button below, so "which wallet am I paying
          with" and "how much do I have" are the same clear tile
          instead of a separate cramped dropdown. */}
      <section>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gold">{t("shop.walletsTitle")}</p>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(Object.keys(SOURCE_LABEL) as FundingSource[]).map((s) => (
            <button
              key={s}
              onClick={() => setSource(s)}
              className={`game-panel hud-corner rounded-2xl p-4 text-left transition ${
                source === s ? "border-gold/60 bg-gold-soft" : "border-line hover:border-gold/30"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{SOURCE_LABEL[s]}</p>
                {source === s && (
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-gold text-background">
                    <Check size={11} strokeWidth={3} />
                  </span>
                )}
              </div>
              <p className={`stat-value mt-1.5 text-lg ${source === s ? "text-gold text-glow-gold" : "text-foreground"}`}>
                ${balanceForSource(s).toFixed(2)}
              </p>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">{t("shop.myItemsTitle")}</h2>
        <div className="mt-2">
          {inventoryLoading ? (
            <p className="text-sm text-muted">…</p>
          ) : (inventory?.items ?? []).length === 0 ? (
            <p className="game-panel hud-corner rounded-2xl border-line p-4 text-sm text-muted">
              {t("shop.noItemsOwned")}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {(inventory?.items ?? []).map((item) => (
                <OwnedItemCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">{t("shop.catalogTitle")}</h2>
        <div className="mt-2">
          {catalogLoading ? (
            <p className="text-sm text-muted">…</p>
          ) : catalog?.shopEnabled === false ? (
            // Admin master switch is off (PlatformSettings.shopEnabled)
            // — new purchases stop and the catalog itself hides here;
            // "My Items" above still lists everything owned (nothing is
            // touched/expired), but none of it can be equipped into a
            // new match until the shop reopens (LoadoutSelectModal /
            // RentalBotPanel both show nothing while it's off, and
            // consumeLoadoutSelections refuses server-side too).
            <div className="game-panel hud-corner flex flex-col items-center gap-2 rounded-2xl border-line p-6 text-center">
              <div className="grid h-11 w-11 place-items-center rounded-full bg-panel-2 text-muted">
                <Lock size={20} />
              </div>
              <p className="font-bold">{t("shop.closedTitle")}</p>
              <p className="text-xs text-muted">{t("shop.closedBody")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(catalog?.items ?? []).map((item) => (
                <CatalogItemCard
                  key={item.id}
                  item={item}
                  owned={ownedConfigIds.has(item.key)}
                  buying={buyingId === item.id}
                  disabled={buyingId !== null || balanceForSource(source) < item.priceUsdt}
                  onBuy={() => doPurchase(item)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {error && (
        <p className="game-panel hud-corner rounded-2xl border-risk/30 p-3 text-sm text-risk">{error}</p>
      )}

      {successModal && (
        <SuccessModal title={successModal.title} rows={successModal.rows} onClose={() => setSuccessModal(null)} />
      )}
    </div>
  );
}

// The "what you actually get" badge for one item, in the same soft
// radial-glow + slowly-spinning dashed orbit ring frame regardless of
// what's inside — a live rocket preview (RocketPreview, same draw code
// the real game uses, tinted with the item's own purchased color) for
// ROCKET_SHAPE, or a glowing category icon (ShopItemIcon) for every
// real stat/power-up upgrade. `glow` adds a pulsing box-shadow (reused
// from src/app/globals.css's pulse-glow keyframe, same one the Play
// page's KOL-bonus card and the wallet-connect button use) — kept off
// for the denser "My Items" grid so a shelf of owned items doesn't turn
// into a wall of pulsing lights.
function ItemVisual({
  category,
  shapeKey,
  colorHex,
  size,
  glow,
}: {
  category: string;
  shapeKey: string | null;
  colorHex: string | null;
  size: number;
  glow?: boolean;
}) {
  const ringColor = category === "ROCKET_SHAPE" ? (colorHex ?? PREVIEW_COLOR) : SHOP_CATEGORY_META[category as ShopItemCategory]?.color ?? PREVIEW_COLOR;
  return (
    <div
      className="relative shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 50% 38%, ${ringColor}3d, ${ringColor}0a 62%, transparent 76%)`,
        ...(glow ? { animation: "pulse-glow 3s ease-in-out infinite" } : {}),
      }}
    >
      <div
        className="absolute inset-1.5 rounded-full border border-dashed"
        style={{ borderColor: `${ringColor}40`, animation: "spin-slow 16s linear infinite" }}
      />
      <div className="absolute inset-0 grid place-items-center">
        {category === "ROCKET_SHAPE" ? (
          <RocketPreview shapeKey={shapeKey} size={size * 0.8} color={colorHex ?? PREVIEW_COLOR} />
        ) : (
          <ShopItemIcon category={category} size={size * 0.72} />
        )}
      </div>
    </div>
  );
}

// Player-facing one-line effect summary — null (renders nothing) for
// ROCKET_SHAPE, which has no gameplay effect to describe. See
// shopItemEffectSummaryKey's own doc-comment in shop-shared.ts for why
// this goes through an i18n key + params instead of a raw string.
function EffectSummary({ item, className }: { item: ShopCatalogItem | OwnedShopItem; className?: string }) {
  const { t } = useLocale();
  const summary = shopItemEffectSummaryKey(item);
  if (!summary) return null;
  return <p className={className}>{t(`shop.${summary.key}`, summary.params)}</p>;
}

function OwnedItemCard({ item }: { item: OwnedShopItem }) {
  const { t } = useLocale();
  return (
    <div
      className={`game-panel hud-corner flex flex-col items-center rounded-2xl p-3 text-center transition ${
        item.isUsable ? "border-line hover:border-gold/40" : "border-line opacity-60"
      }`}
    >
      <ItemVisual category={item.category} shapeKey={item.shapeKey} colorHex={item.colorHex} size={84} />
      <p className="mt-2 truncate text-xs font-bold">{item.label}</p>
      <EffectSummary item={item} className="mt-0.5 text-[10px] text-gold" />
      <p className="mt-0.5 text-[11px] text-muted">
        {item.usesRemaining !== null
          ? t("shop.usesRemainingLabel", { uses: item.usesRemaining })
          : item.expiresAt
            ? t(item.isUsable ? "shop.expiresLabel" : "shop.expiredLabel", {
                date: new Date(item.expiresAt).toLocaleDateString(),
              })
            : null}
      </p>
      {!item.isUsable && (
        <span className="mt-1.5 rounded-full bg-panel-2 px-2.5 py-0.5 text-[10px] font-bold uppercase text-muted">
          {t("shop.expiredLabel")}
        </span>
      )}
    </div>
  );
}

function CatalogItemCard({
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
    <div className="game-panel hud-corner glow-gold flex flex-col items-center rounded-2xl border-line p-4 text-center transition hover:-translate-y-1 hover:border-gold/50">
      <ItemVisual category={item.category} shapeKey={item.shapeKey} colorHex={item.colorHex} size={112} glow />
      <p className="mt-2.5 rounded-full border border-gold/30 bg-gold-soft px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold">
        {pricingLabel}
      </p>
      <p className="mt-2 font-bold">{item.label}</p>
      <p className="mt-1 min-h-[2.5em] text-xs text-muted">{item.description}</p>
      <EffectSummary item={item} className="mt-1 text-xs font-semibold text-gold" />
      <p className="stat-value mt-2 text-xl">${item.priceUsdt.toFixed(2)}</p>
      {/* Non-blocking — these are consumable (N-games/time-window),
          never a one-time permanent unlock, so owning an active one
          already is never a reason to disable buying another (e.g.
          stacking more uses, or a fresh pass before the current one
          runs out). Same "purchases stack" model mining hashrate
          already uses. */}
      {owned && (
        <span className="mt-1.5 rounded-full bg-mint-soft px-2.5 py-0.5 text-[10px] font-bold uppercase text-mint">
          {t("shop.ownedBadge")}
        </span>
      )}
      <button
        onClick={onBuy}
        disabled={disabled}
        className="btn-game hud-corner mt-3 w-full rounded-full px-4 py-2 text-sm disabled:opacity-50"
      >
        {buying ? t("shop.buyingButton") : t("shop.buyButton")}
      </button>
    </div>
  );
}
