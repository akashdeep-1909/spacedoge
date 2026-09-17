"use client";

import { useShopInventory, usePublicSettings, type OwnedShopItem } from "@/lib/hooks";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { SOLO_LOADOUT_CATEGORIES, ShopItemCategory } from "@/lib/shop-shared";
import { ShopItemIcon } from "@/components/game/ShopItemIcon";

export interface PreJoinSelections {
  loadout: Partial<Record<ShopItemCategory, string | null>>;
  rentalBotItemId: string | null;
}

// The pre-join sibling of LobbyLoadoutPanel/RentalBotPanel — same
// categories, same visual shape, but purely local state (a plain
// controlled value + onChange) instead of an immediate PATCH per
// click, because there's no lobby membership yet to save a selection
// against: setLobbyRentalBot/the loadout PATCH route both require
// being an already-JOINED participant, which is exactly the step this
// screen exists to defer. See the lobby page's own handleAcceptAndReady
// for where these local picks actually get applied — accept the
// invitation first (that's the real join), then PATCH each one now
// that membership exists.
export function PreJoinLoadoutPicker({
  selections,
  onChange,
}: {
  selections: PreJoinSelections;
  onChange: (next: PreJoinSelections) => void;
}) {
  const { t } = useLocale();
  const { data: inventory, isLoading } = useShopInventory();
  const { data: publicSettings } = usePublicSettings();
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

  const rentalBotOwned = shopClosed
    ? []
    : (inventory?.items ?? []).filter((i): i is OwnedShopItem => i.category === "RENTAL_BOT" && i.isUsable);

  function setCategory(category: ShopItemCategory, walletShopItemId: string | null) {
    onChange({ ...selections, loadout: { ...selections.loadout, [category]: walletShopItemId } });
  }
  function setRentalBot(walletShopItemId: string | null) {
    onChange({ ...selections, rentalBotItemId: walletShopItemId });
  }

  if (isLoading) return null;

  return (
    <>
      {!shopClosed && sections.length > 0 && (
        <div className="game-panel hud-corner mt-4 rounded-2xl p-4">
          <div className="flex flex-col gap-4">
            {sections.map(({ category, items }) => (
              <div key={category}>
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gold">
                  <ShopItemIcon category={category} size={16} />
                  {CATEGORY_LABEL[category]}
                </div>
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => setCategory(category, null)}
                    className={`rounded-xl border p-2.5 text-left text-sm transition ${
                      !selections.loadout[category] ? "border-gold/50 bg-gold-soft" : "border-line bg-panel-2 hover:border-gold/30"
                    }`}
                  >
                    <span className="font-bold">{t("shop.loadoutNoneOption")}</span>
                  </button>
                  {items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setCategory(category, item.id)}
                      className={`rounded-xl border p-2.5 text-left text-sm transition ${
                        selections.loadout[category] === item.id ? "border-gold/50 bg-gold-soft" : "border-line bg-panel-2 hover:border-gold/30"
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
        </div>
      )}

      <div className="game-panel hud-corner mt-4 rounded-2xl p-4">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gold">
          <ShopItemIcon category="RENTAL_BOT" size={16} />
          {t("lobby.rentalBotHeading")}
        </div>
        <p className="mt-1 text-xs text-muted">{t("lobby.rentalBotSubtitle")}</p>

        {shopClosed ? (
          <p className="mt-3 rounded-xl border border-line bg-panel-2 p-3 text-xs text-muted">{t("lobby.rentalBotShopClosed")}</p>
        ) : rentalBotOwned.length === 0 ? (
          <p className="mt-3 rounded-xl border border-line bg-panel-2 p-3 text-xs text-muted">{t("lobby.rentalBotEmptyInventory")}</p>
        ) : (
          <div className="mt-3 flex flex-col gap-1.5">
            <button
              onClick={() => setRentalBot(null)}
              className={`rounded-xl border p-2.5 text-left text-sm transition ${
                !selections.rentalBotItemId ? "border-gold/50 bg-gold-soft" : "border-line bg-panel-2 hover:border-gold/30"
              }`}
            >
              <span className="font-bold">{t("shop.loadoutNoneOption")}</span>
            </button>
            {rentalBotOwned.map((item) => (
              <button
                key={item.id}
                onClick={() => setRentalBot(item.id)}
                className={`rounded-xl border p-2.5 text-left text-sm transition ${
                  selections.rentalBotItemId === item.id ? "border-gold/50 bg-gold-soft" : "border-line bg-panel-2 hover:border-gold/30"
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
        )}
      </div>
    </>
  );
}
