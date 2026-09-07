"use client";

import { useState } from "react";
import Link from "next/link";
import { useShopInventory, usePatchLobbyRentalBot, usePublicSettings, type OwnedShopItem } from "@/lib/hooks";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { ShopItemIcon } from "@/components/game/ShopItemIcon";

// The ONE surface every way of ending up in a Play-with-Friends lobby
// (hosting, accepting a direct invite, an invite link, a room code)
// lands on before the match starts — so this single panel on the lobby
// waiting-room page covers all of them, no changes needed to any of
// the 3 separate join/accept flows themselves. Lets the caller equip/
// swap/clear their own Rental Bot pass any time before the lobby
// leaves WAITING/FULL; see setLobbyRentalBot's own doc-comment in
// src/lib/lobby.ts for the validate-now/consume-at-finalize split.
export function RentalBotPanel({
  lobbyId,
  myRentalBot,
}: {
  lobbyId: string;
  myRentalBot: { walletShopItemId: string; label: string } | null;
}) {
  const { t } = useLocale();
  const { data: inventory, isLoading } = useShopInventory();
  const { data: publicSettings } = usePublicSettings();
  const patch = usePatchLobbyRentalBot(lobbyId);
  const [error, setError] = useState<string | null>(null);

  // Admin shop master switch (PlatformSettings.shopEnabled) — while
  // it's off, nothing owned is offered here even if already equipped
  // (myRentalBot); finalizeLobby's own consumeLoadoutSelections call
  // (src/lib/shop.ts) refuses to resolve it server-side regardless, so
  // this is a proactive hint, not the only thing enforcing it.
  const shopClosed = publicSettings?.shopEnabled === false;
  const owned = shopClosed
    ? []
    : (inventory?.items ?? []).filter((i): i is OwnedShopItem => i.category === "RENTAL_BOT" && i.isUsable);

  async function select(walletShopItemId: string | null) {
    setError(null);
    try {
      await patch.mutateAsync(walletShopItemId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("lobby.rentalBotFailedToSave"));
    }
  }

  return (
    <div className="game-panel hud-corner mt-4 rounded-2xl p-4">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gold">
        <ShopItemIcon category="RENTAL_BOT" size={16} />
        {t("lobby.rentalBotHeading")}
      </div>
      <p className="mt-1 text-xs text-muted">{t("lobby.rentalBotSubtitle")}</p>

      {isLoading ? (
        <p className="mt-3 text-xs text-muted">…</p>
      ) : shopClosed ? (
        <p className="mt-3 rounded-xl border border-line bg-panel-2 p-3 text-xs text-muted">{t("lobby.rentalBotShopClosed")}</p>
      ) : owned.length === 0 ? (
        <p className="mt-3 rounded-xl border border-line bg-panel-2 p-3 text-xs text-muted">
          {t("lobby.rentalBotEmptyInventory")}{" "}
          <Link href="/dashboard/shop" className="text-gold underline">
            {t("shop.loadoutVisitShopLink")}
          </Link>
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-1.5">
          <button
            onClick={() => select(null)}
            disabled={patch.isPending}
            className={`rounded-xl border p-2.5 text-left text-sm transition disabled:opacity-50 ${
              !myRentalBot ? "border-gold/50 bg-gold-soft" : "border-line bg-panel-2 hover:border-gold/30"
            }`}
          >
            <span className="font-bold">{t("shop.loadoutNoneOption")}</span>
          </button>
          {owned.map((item) => (
            <button
              key={item.id}
              onClick={() => select(item.id)}
              disabled={patch.isPending}
              className={`rounded-xl border p-2.5 text-left text-sm transition disabled:opacity-50 ${
                myRentalBot?.walletShopItemId === item.id ? "border-gold/50 bg-gold-soft" : "border-line bg-panel-2 hover:border-gold/30"
              }`}
            >
              <span className="font-bold">{item.label}</span>
              <span className="ml-2 text-[11px] text-muted">
                {item.usesRemaining !== null
                  ? t("shop.usesRemainingLabel", { uses: item.usesRemaining })
                  : item.expiresAt
                    ? t("shop.expiresLabel", { date: new Date(item.expiresAt).toLocaleDateString() })
                    : null}
              </span>
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-risk">{error}</p>}
    </div>
  );
}
