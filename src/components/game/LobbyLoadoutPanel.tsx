"use client";

import { useState } from "react";
import { useShopInventory, usePatchLobbyLoadout, usePublicSettings, type OwnedShopItem } from "@/lib/hooks";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { SOLO_LOADOUT_CATEGORIES, ShopItemCategory } from "@/lib/shop-shared";
import { ShopItemIcon } from "@/components/game/ShopItemIcon";

// The general-purpose sibling of RentalBotPanel — every OTHER sellable
// category (rocket skin, Speed/Health/Magnet/Fire/Shield upgrade),
// equipped from the SAME lobby waiting-room page every join path (host,
// direct invite, invite link, room code) lands on before the match
// starts. Added because Play-with-Friends had never actually consumed
// anything from these categories at all — a purchased rocket skin or
// upgrade silently never applied in a lobby match, confirmed live as a
// real gap (only RENTAL_BOT was ever wired into finalizeLobby). One
// section per category the wallet owns at least one usable item in —
// mirrors LoadoutSelectModal's own section shape, just rendered as an
// always-visible inline panel (immediate PATCH per click) instead of a
// modal with a batch "Start" button, matching RentalBotPanel's own
// established pattern for this page.
export function LobbyLoadoutPanel({
  lobbyId,
  myLoadout,
}: {
  lobbyId: string;
  myLoadout: Partial<Record<ShopItemCategory, { walletShopItemId: string; label: string }>>;
}) {
  const { t } = useLocale();
  const { data: inventory, isLoading } = useShopInventory();
  const { data: publicSettings } = usePublicSettings();
  const patch = usePatchLobbyLoadout(lobbyId);
  const [error, setError] = useState<string | null>(null);
  const [pendingCategory, setPendingCategory] = useState<ShopItemCategory | null>(null);

  // Admin shop master switch (PlatformSettings.shopEnabled) — while
  // it's off, nothing owned is offered here even if already equipped;
  // finalizeLobby's own consumeLoadoutSelections call (src/lib/shop.ts)
  // refuses to resolve any selection server-side regardless, so this
  // is a proactive hint, not the only thing enforcing it.
  const shopClosed = publicSettings?.shopEnabled === false;

  const CATEGORY_LABEL: Record<(typeof SOLO_LOADOUT_CATEGORIES)[number], string> = {
    ROCKET_SHAPE: t("shop.categoryRocket"),
    STAT_SPEED: t("shop.categorySpeed"),
    STAT_HEALTH: t("shop.categoryHealth"),
    POWERUP_MAGNET: t("shop.categoryMagnet"),
    POWERUP_FIRE: t("shop.categoryFire"),
    POWERUP_SHIELD: t("shop.categoryShield"),
  };

  const sections = shopClosed
    ? []
    : SOLO_LOADOUT_CATEGORIES.map((category) => ({
        category,
        items: (inventory?.items ?? []).filter((i): i is OwnedShopItem => i.category === category && i.isUsable),
      })).filter((s) => s.items.length > 0);

  async function select(category: ShopItemCategory, walletShopItemId: string | null) {
    setError(null);
    setPendingCategory(category);
    try {
      await patch.mutateAsync({ category, walletShopItemId });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("shop.loadoutFailedToSave"));
    } finally {
      setPendingCategory(null);
    }
  }

  if (isLoading) return null;
  if (!shopClosed && sections.length === 0) return null;

  return (
    <div className="game-panel hud-corner mt-4 rounded-2xl p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gold">{t("shop.loadoutModalTitle")}</p>
      <p className="mt-1 text-xs text-muted">{t("shop.loadoutModalSubtitle")}</p>

      {shopClosed ? (
        <p className="mt-3 rounded-xl border border-line bg-panel-2 p-3 text-xs text-muted">{t("shop.loadoutShopClosed")}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          {sections.map(({ category, items }) => (
            <div key={category}>
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gold">
                <ShopItemIcon category={category} size={16} />
                {CATEGORY_LABEL[category]}
              </div>
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={() => select(category, null)}
                  disabled={patch.isPending && pendingCategory === category}
                  className={`rounded-xl border p-2.5 text-left text-sm transition disabled:opacity-50 ${
                    !myLoadout[category] ? "border-gold/50 bg-gold-soft" : "border-line bg-panel-2 hover:border-gold/30"
                  }`}
                >
                  <span className="font-bold">{t("shop.loadoutNoneOption")}</span>
                </button>
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => select(category, item.id)}
                    disabled={patch.isPending && pendingCategory === category}
                    className={`rounded-xl border p-2.5 text-left text-sm transition disabled:opacity-50 ${
                      myLoadout[category]?.walletShopItemId === item.id ? "border-gold/50 bg-gold-soft" : "border-line bg-panel-2 hover:border-gold/30"
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
      {error && <p className="mt-2 text-xs text-risk">{error}</p>}
    </div>
  );
}
