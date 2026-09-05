// Pure constants/types with no server-only imports (no `db`), so client
// components (CoinRushArena.tsx, the shop UI) can import shape/category
// definitions without pulling the Prisma/pg driver into the browser
// bundle — same split src/lib/mining-shared.ts already uses relative to
// src/lib/mining.ts (server-only).

// Mirrors the Prisma ShopItemCategory enum as a plain string union —
// every client component that touches shop data works with the
// already-JSON-serialized string value from an API response, never the
// real Prisma-generated enum type (same reasoning admin/mining-profit's
// own `level: string` props already use for MiningLevel).
export type ShopItemCategory =
  | "ROCKET_SHAPE"
  | "STAT_SPEED"
  | "STAT_HEALTH"
  | "POWERUP_MAGNET"
  | "POWERUP_FIRE"
  | "POWERUP_SHIELD"
  | "EXTRA_TIME"
  | "RENTAL_BOT";

export type ShopEntitlementType = "USES" | "TIME_WINDOW";

// Client-safe mirror of src/lib/shop.ts's own ResolvedLoadout (a
// server-only file — it imports `db`) — what CoinRushArena.tsx and
// dashboard/play/page.tsx actually receive back from POST /api/matches
// once JSON-serialized, so this lives here instead where both server
// and client code can import the same shape without pulling Prisma
// into the browser bundle. Keep in sync with shop.ts's own
// ResolvedLoadout by hand — there is no automated check tying the two
// together, so a new effect field added to one needs the other updated
// too.
export interface ResolvedLoadout {
  shapeKey: string | null;
  colorHex: string | null;
  speedMultBonus: number | null;
  livesBonus: number | null;
  magnetDurationBonusSec: number | null;
  magnetCooldownDeltaSec: number | null;
  fireExtraUses: number | null;
  fireDurationBonusSec: number | null;
  shieldDurationBonusSec: number | null;
  shieldCooldownDeltaSec: number | null;
  // RENTAL_BOT — a pure boolean capability, no magnitude. Only ever
  // true for a Play-with-Friends lobby match; solo/instant-play never
  // resolves this true regardless of what a client sends (see
  // consumeLoadoutSelections' own allowRentalBot param in shop.ts).
  rentalBot: boolean;
}

// Every category an admin can actually create a NEW item in today —
// EXTRA_TIME is a real schema category but has no selling/UI/game-
// effect wiring anywhere yet (see the shop plan's own scope note), so
// it's deliberately excluded from this list rather than shown as a
// dead option.
export const SELLABLE_SHOP_CATEGORIES = [
  "ROCKET_SHAPE",
  "STAT_SPEED",
  "STAT_HEALTH",
  "POWERUP_MAGNET",
  "POWERUP_FIRE",
  "POWERUP_SHIELD",
  "RENTAL_BOT",
] as const satisfies readonly ShopItemCategory[];

// RENTAL_BOT is purchasable/admin-creatable like any other category
// (SELLABLE_SHOP_CATEGORIES above) but deliberately excluded from the
// solo pre-match loadout picker (LoadoutSelectModal.tsx) — it only
// ever works in a Play-with-Friends lobby (equipped from the lobby
// waiting-room page instead), server-enforced regardless of what a
// client tries to send.
export const SOLO_LOADOUT_CATEGORIES = SELLABLE_SHOP_CATEGORIES.filter(
  (c): c is Exclude<(typeof SELLABLE_SHOP_CATEGORIES)[number], "RENTAL_BOT"> => c !== "RENTAL_BOT"
);

// Icon + glow color per category — reuses the EXACT symbols already
// shown as the in-game power-up buttons (CoinRushArena.tsx) and the
// exact ring colors those power-ups already render in a live match
// (magnet #ff4fd8, shield #33f2a4), so a shop tile and its real
// in-match effect are visually the same thing, never a mismatched
// stand-in icon. Used by ShopItemIcon (src/components/game/
// ShopItemIcon.tsx) on both the admin live-preview and every player-
// facing catalog/inventory card.
export const SHOP_CATEGORY_META: Record<ShopItemCategory, { icon: string; color: string; label: string }> = {
  ROCKET_SHAPE: { icon: "🚀", color: "#f4c15d", label: "Rocket Skin" },
  STAT_SPEED: { icon: "⚡", color: "#4fd1ff", label: "Speed Boost" },
  STAT_HEALTH: { icon: "❤️", color: "#ff6767", label: "Extra Health" },
  POWERUP_MAGNET: { icon: "🧲", color: "#ff4fd8", label: "Magnet Upgrade" },
  POWERUP_FIRE: { icon: "🔥", color: "#ff8a3d", label: "Fire Upgrade" },
  POWERUP_SHIELD: { icon: "🛡️", color: "#33f2a4", label: "Shield Upgrade" },
  EXTRA_TIME: { icon: "⏱️", color: "#9aa1ab", label: "Extra Time" },
  RENTAL_BOT: { icon: "🤖", color: "#8b7cf0", label: "Rental Bot" },
};

// Every effect field a catalog/owned item can carry — subset shape
// shared with ShopItemEffects (src/lib/hooks.ts) so either of the
// functions below can be called on a ShopCatalogItem, OwnedShopItem,
// or AdminShopItemRow without a cast. Deliberately just the magnitude
// summary, not price/entitlement (those are shown separately
// everywhere this is used).
export interface EffectSummaryInput {
  category: string;
  speedMultBonus: number | null;
  livesBonus: number | null;
  magnetDurationBonusSec: number | null;
  magnetCooldownDeltaSec: number | null;
  fireExtraUses: number | null;
  fireDurationBonusSec: number | null;
  shieldDurationBonusSec: number | null;
  shieldCooldownDeltaSec: number | null;
}

// Admin-only (the admin panel is plain English throughout, no i18n by
// standing convention) — the live one-line summary shown on the Add
// Item form and next to every existing catalog row in /admin/shop, so
// an admin can sanity-check the numbers they just typed without doing
// the math themselves.
export function describeShopItemEffectPlainEnglish(item: EffectSummaryInput): string | null {
  switch (item.category) {
    case "ROCKET_SHAPE":
      return null; // purely cosmetic — nothing to summarize
    case "STAT_SPEED":
      return item.speedMultBonus !== null ? `+${Math.round(item.speedMultBonus * 100)}% top speed, all match` : null;
    case "STAT_HEALTH":
      return item.livesBonus !== null ? `+${item.livesBonus} starting ${item.livesBonus === 1 ? "life" : "lives"}` : null;
    case "POWERUP_MAGNET":
      return item.magnetDurationBonusSec !== null || item.magnetCooldownDeltaSec !== null
        ? `Magnet: +${item.magnetDurationBonusSec ?? 0}s duration, ${item.magnetCooldownDeltaSec ?? 0}s cooldown`
        : null;
    case "POWERUP_FIRE":
      return item.fireExtraUses !== null || item.fireDurationBonusSec !== null
        ? `Fire: +${item.fireExtraUses ?? 0} use(s), +${item.fireDurationBonusSec ?? 0}s duration`
        : null;
    case "POWERUP_SHIELD":
      return item.shieldDurationBonusSec !== null || item.shieldCooldownDeltaSec !== null
        ? `Shield: +${item.shieldDurationBonusSec ?? 0}s duration, ${item.shieldCooldownDeltaSec ?? 0}s cooldown`
        : null;
    case "RENTAL_BOT":
      return "Auto-plays your ship — Play with Friends only, equip from the lobby waiting room";
    default:
      return null;
  }
}

// Player-facing counterpart — returns an i18n key (under the `shop.*`
// namespace) + its params instead of a raw string, so every locale
// controls its own phrasing/word order rather than interpolating into
// an English-only template. Used by the Shop catalog/inventory cards
// and the pre-match loadout picker. Health/Fire get a singular/plural
// key pair (this app's own established pattern for count-sensitive
// copy, e.g. lobby.gamesTogetherSingular/Plural) since "1 use" vs
// "2 uses" don't share a template across every locale.
export type ShopEffectSummaryKey =
  | "effectSpeed"
  | "effectHealthSingular"
  | "effectHealthPlural"
  | "effectMagnet"
  | "effectFireSingular"
  | "effectFirePlural"
  | "effectShield"
  | "effectRentalBot";

export function shopItemEffectSummaryKey(
  item: EffectSummaryInput
): { key: ShopEffectSummaryKey; params: Record<string, string | number> } | null {
  switch (item.category) {
    case "ROCKET_SHAPE":
      return null;
    case "STAT_SPEED":
      return item.speedMultBonus !== null ? { key: "effectSpeed", params: { pct: Math.round(item.speedMultBonus * 100) } } : null;
    case "STAT_HEALTH":
      return item.livesBonus !== null
        ? { key: item.livesBonus === 1 ? "effectHealthSingular" : "effectHealthPlural", params: { count: item.livesBonus } }
        : null;
    case "POWERUP_MAGNET":
      return item.magnetDurationBonusSec !== null || item.magnetCooldownDeltaSec !== null
        ? { key: "effectMagnet", params: { duration: item.magnetDurationBonusSec ?? 0, cooldown: item.magnetCooldownDeltaSec ?? 0 } }
        : null;
    case "POWERUP_FIRE":
      return item.fireExtraUses !== null || item.fireDurationBonusSec !== null
        ? {
            key: item.fireExtraUses === 1 ? "effectFireSingular" : "effectFirePlural",
            params: { uses: item.fireExtraUses ?? 0, duration: item.fireDurationBonusSec ?? 0 },
          }
        : null;
    case "POWERUP_SHIELD":
      return item.shieldDurationBonusSec !== null || item.shieldCooldownDeltaSec !== null
        ? { key: "effectShield", params: { duration: item.shieldDurationBonusSec ?? 0, cooldown: item.shieldCooldownDeltaSec ?? 0 } }
        : null;
    case "RENTAL_BOT":
      return { key: "effectRentalBot", params: {} };
    default:
      return null;
  }
}

// The rocket shapes a ROCKET_SHAPE item can grant — 6 genuinely
// different silhouettes (a "sci-fi mixed fleet": classic rocket,
// saucer, orb drone, stealth wedge, comet, twin-boom fighter), each
// with its OWN hand-drawn canvas path in src/lib/rocketShape.ts — not
// the same base ship with nose/wing proportions nudged (that was the
// original Phase 1 model; confirmed via a real side-by-side that the
// difference read as too subtle to call "different shapes"). Every
// shape still renders at the exact same collision hitbox regardless of
// which one's equipped (drawRocketShip's own `r` param, passed through
// unchanged) — a cosmetic purchase can never be a disguised
// pay-to-win advantage, the one hard rule this whole feature is built
// around.
//
// VOYAGER/INTERCEPTOR/CRUISER are kept as recognized (but no longer
// offered in the admin dropdown) LEGACY keys — real WalletShopItem
// rows already sold under the old 3-shape model still carry these
// values verbatim (snapshotted at purchase time, never rewritten), so
// they must keep resolving to SOMETHING via LEGACY_SHAPE_ALIAS below
// rather than silently falling through to a default. New purchases
// only ever get one of the 6 keys in ROCKET_SHAPES.
export const ROCKET_SHAPES = ["ROCKET", "SAUCER", "ORB", "WEDGE", "COMET", "FIGHTER"] as const;
export type RocketShapeKey = (typeof ROCKET_SHAPES)[number];

// Old Phase 1 geometry-variant keys → the closest-feeling one of the 6
// real shapes above, so a wallet that bought a rocket under the old
// model keeps seeing a real, still-cosmetic-only ship rather than an
// error or an unstyled fallback. See rocketShape.ts's drawRocketShip
// for where this is actually consulted.
export const LEGACY_SHAPE_ALIAS: Record<string, RocketShapeKey> = {
  VOYAGER: "ROCKET",
  INTERCEPTOR: "WEDGE",
  CRUISER: "FIGHTER",
};

// Fixed 6-item seed catalog — each of the 6 named SKUs maps onto one
// of the 6 real distinct shapes above (no more sharing one silhouette
// across multiple SKUs, unlike the old model). Real i18n keys/pricing
// live server-side in src/lib/shop.ts's own seed defaults; this list
// exists so the client shape-preview renderer (the loadout picker) can
// draw every catalog option without waiting on a network round-trip
// for the geometry itself, only for price/ownership. `key` values are
// permanent (already real unique DB keys) — only `shapeKey`/`colorHex`
// changed from the original Phase 1 seed.
export const SHOP_ROCKET_SHAPE_CATALOG: { key: string; shapeKey: RocketShapeKey; name: string; colorHex: string }[] = [
  { key: "ROCKET_VOYAGER", shapeKey: "ROCKET", name: "Voyager", colorHex: "#f4c15d" },
  { key: "ROCKET_ZEPHYR", shapeKey: "SAUCER", name: "Zephyr", colorHex: "#4fd1ff" },
  { key: "ROCKET_INTERCEPTOR", shapeKey: "WEDGE", name: "Interceptor", colorHex: "#8b7cf0" },
  { key: "ROCKET_RAPTOR", shapeKey: "FIGHTER", name: "Raptor", colorHex: "#ff6b4a" },
  { key: "ROCKET_CRUISER", shapeKey: "ORB", name: "Cruiser", colorHex: "#2dd4a7" },
  { key: "ROCKET_JUGGERNAUT", shapeKey: "COMET", name: "Juggernaut", colorHex: "#ff4fd8" },
];
