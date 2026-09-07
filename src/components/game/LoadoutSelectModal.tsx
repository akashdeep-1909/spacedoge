"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useShopInventory, usePublicSettings, type OwnedShopItem } from "@/lib/hooks";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { SOLO_LOADOUT_CATEGORIES, ShopItemCategory } from "@/lib/shop-shared";
import { ShopItemIcon } from "@/components/game/ShopItemIcon";

// The "before entering a game, which product does the wallet own and
// want to use" screen — one optional slot per category it owns at
// least one currently-usable item in (never a buy flow, that's
// /dashboard/shop). Only ever passes back a Partial<Record<category,
// walletShopItemId>>; POST /api/matches (src/lib/shop.ts
// consumeLoadoutSelections) is the one place any of these selections
// is ever actually validated/consumed, so a stale client snapshot here
// (an item expired between opening this modal and tapping Start)
// degrades gracefully server-side rather than needing to be airtight
// here.
export function LoadoutSelectModal({
  open,
  onCancel,
  onStart,
  starting,
}: {
  open: boolean;
  onCancel: () => void;
  onStart: (selections: Partial<Record<ShopItemCategory, string>>) => void;
  starting: boolean;
}) {
  const { t } = useLocale();
  const { data, isLoading } = useShopInventory();
  const { data: publicSettings } = usePublicSettings();
  const [selected, setSelected] = useState<Partial<Record<ShopItemCategory, string>>>({});

  if (!open) return null;

  // Admin shop master switch (PlatformSettings.shopEnabled) — while
  // it's off, nothing owned is offered here even if the inventory
  // fetch itself still lists it; consumeLoadoutSelections (src/lib/
  // shop.ts) refuses to resolve a selection server-side regardless, so
  // this is a proactive hint, not the only thing enforcing it.
  const shopClosed = publicSettings?.shopEnabled === false;

  // RENTAL_BOT is deliberately absent — solo/instant-play never offers
  // it (see SOLO_LOADOUT_CATEGORIES' own doc-comment in shop-shared.ts);
  // it's equipped from the Play-with-Friends lobby waiting room instead.
  const CATEGORY_LABEL: Record<(typeof SOLO_LOADOUT_CATEGORIES)[number], string> = {
    ROCKET_SHAPE: t("shop.categoryRocket"),
    STAT_SPEED: t("shop.categorySpeed"),
    STAT_HEALTH: t("shop.categoryHealth"),
    POWERUP_MAGNET: t("shop.categoryMagnet"),
    POWERUP_FIRE: t("shop.categoryFire"),
    POWERUP_SHIELD: t("shop.categoryShield"),
  };

  // One section per category the wallet owns at least one usable item
  // in — a category with nothing owned isn't shown at all (nothing to
  // pick between, "None" is already the default with no section
  // needed to say so).
  const sections = shopClosed
    ? []
    : SOLO_LOADOUT_CATEGORIES.map((category) => ({
        category,
        items: (data?.items ?? []).filter((i): i is OwnedShopItem => i.category === category && i.isUsable),
      })).filter((s) => s.items.length > 0);

  function select(category: ShopItemCategory, itemId: string | null) {
    setSelected((prev) => {
      const next = { ...prev };
      if (itemId) next[category] = itemId;
      else delete next[category];
      return next;
    });
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="fixed inset-x-4 top-1/2 z-50 max-h-[85vh] -translate-y-1/2 overflow-y-auto sm:left-1/2 sm:right-auto sm:w-full sm:max-w-sm sm:-translate-x-1/2">
        <div className="game-panel hud-corner rounded-2xl border-gold/25 p-5">
          <h3 className="text-glow-gold text-lg font-black">{t("shop.loadoutModalTitle")}</h3>
          <p className="mt-1 text-xs text-muted">{t("shop.loadoutModalSubtitle")}</p>

          {isLoading ? (
            <p className="mt-4 text-sm text-muted">…</p>
          ) : shopClosed ? (
            <p className="mt-4 rounded-xl border border-line bg-panel-2 p-3 text-xs text-muted">{t("shop.loadoutShopClosed")}</p>
          ) : sections.length === 0 ? (
            <p className="mt-4 rounded-xl border border-line bg-panel-2 p-3 text-xs text-muted">
              {t("shop.loadoutEmptyInventory")}{" "}
              <Link href="/dashboard/shop" className="text-gold underline">
                {t("shop.loadoutVisitShopLink")}
              </Link>
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-4">
              {sections.map(({ category, items }) => (
                <div key={category}>
                  <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gold">
                    <ShopItemIcon category={category} size={16} />
                    {CATEGORY_LABEL[category]}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    <button
                      onClick={() => select(category, null)}
                      className={`rounded-xl border p-2.5 text-left text-sm transition ${
                        !selected[category] ? "border-gold/50 bg-gold-soft" : "border-line bg-panel-2 hover:border-gold/30"
                      }`}
                    >
                      <span className="font-bold">{t("shop.loadoutNoneOption")}</span>
                    </button>
                    {items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => select(category, item.id)}
                        className={`rounded-xl border p-2.5 text-left text-sm transition ${
                          selected[category] === item.id ? "border-gold/50 bg-gold-soft" : "border-line bg-panel-2 hover:border-gold/30"
                        }`}
                      >
                        <span className="font-bold">{item.label}</span>
                        <span className="ml-2 text-[11px] text-muted">
                          {[
                            item.usesRemaining !== null ? t("shop.usesRemainingLabel", { uses: item.usesRemaining }) : null,
                            item.expiresAt ? t("shop.expiresLabel", { date: new Date(item.expiresAt).toLocaleDateString() }) : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <button
              onClick={onCancel}
              disabled={starting}
              className="btn-game-outline flex-1 rounded-full px-4 py-2 text-sm disabled:opacity-50"
            >
              {t("shop.loadoutCancelButton")}
            </button>
            <button
              onClick={() => onStart(selected)}
              disabled={starting}
              className="btn-game hud-corner flex-1 rounded-full px-4 py-2 text-sm disabled:opacity-50"
            >
              {starting ? t("play.startingButton") : t("shop.loadoutStartButton")}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
