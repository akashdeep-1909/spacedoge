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
  | "EXTRA_TIME";

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
] as const satisfies readonly ShopItemCategory[];

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
  | "effectShield";

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
    default:
      return null;
  }
}

// The rocket shapes a ROCKET_SHAPE item can grant — Phase 1's whole
// purchasable catalog. Three distinct geometric silhouettes (not just
// three recolors): CoinRushArena.tsx's drawRocket() multiplies its
// existing nose/wing/body path coordinates by these factors per shape,
// reusing the same drawing code rather than three hand-written path
// sets. Deliberately does NOT include any collision-radius factor —
// every shape must render at the exact same hitbox as the default
// look (drawRocket's own `r` param, passed through unchanged), so a
// cosmetic purchase can never be a disguised pay-to-win advantage. See
// the shop plan's own explicit constraint on this.
export const ROCKET_SHAPES = ["VOYAGER", "INTERCEPTOR", "CRUISER"] as const;
export type RocketShapeKey = (typeof ROCKET_SHAPES)[number];

export interface RocketShapeGeometry {
  noseLen: number; // nose-cone length multiplier
  wingSpread: number; // how far the wings splay outward
  wingLen: number; // wing length
  bodyWidth: number; // hull half-width
  flameLenMult: number; // engine flame length multiplier
}

export const ROCKET_SHAPE_GEOMETRY: Record<RocketShapeKey, RocketShapeGeometry> = {
  // The existing, original silhouette — every non-shop rocket (bots,
  // any "you" ship with no shape equipped) still renders exactly this
  // way, byte-identical to before this feature existed.
  VOYAGER: { noseLen: 1, wingSpread: 1, wingLen: 1, bodyWidth: 1, flameLenMult: 1 },
  // Sleeker, narrower — a longer nose and swept-in wings read as
  // "built for speed" without actually changing real speed (that's a
  // separate, later-phase purchase category).
  INTERCEPTOR: { noseLen: 1.25, wingSpread: 0.7, wingLen: 0.8, bodyWidth: 0.85, flameLenMult: 1.15 },
  // Bulkier, wider — a shorter nose and broad, swept-out wings read as
  // "built tough."
  CRUISER: { noseLen: 0.85, wingSpread: 1.35, wingLen: 1.25, bodyWidth: 1.2, flameLenMult: 0.9 },
};

// Phase 1's fixed 6-item catalog, 2 cosmetic variants per geometric
// shape — display names only, kept separate from ROCKET_SHAPES (the
// underlying geometry key) since several catalog items intentionally
// share one silhouette. Real i18n keys/pricing live server-side in
// src/lib/shop.ts's own seed defaults; this list exists so the client
// shape-preview renderer (the loadout picker) can draw every catalog
// option without waiting on a network round-trip for the geometry
// itself, only for price/ownership.
//
// colorHex gives each of the 6 seed SKUs a distinct look even where
// two share a geometry (Voyager/Zephyr are both the VOYAGER shape,
// Interceptor/Raptor both INTERCEPTOR, Cruiser/Juggernaut both
// CRUISER) — Phase 2 (admin-configurable color, see ShopItemConfig.
// colorHex) lets an admin pick anything; these are just the seeded
// starting values.
export const SHOP_ROCKET_SHAPE_CATALOG: { key: string; shapeKey: RocketShapeKey; name: string; colorHex: string }[] = [
  { key: "ROCKET_VOYAGER", shapeKey: "VOYAGER", name: "Voyager", colorHex: "#f4c15d" },
  { key: "ROCKET_ZEPHYR", shapeKey: "VOYAGER", name: "Zephyr", colorHex: "#4fd1ff" },
  { key: "ROCKET_INTERCEPTOR", shapeKey: "INTERCEPTOR", name: "Interceptor", colorHex: "#8b7cf0" },
  { key: "ROCKET_RAPTOR", shapeKey: "INTERCEPTOR", name: "Raptor", colorHex: "#ff6b4a" },
  { key: "ROCKET_CRUISER", shapeKey: "CRUISER", name: "Cruiser", colorHex: "#2dd4a7" },
  { key: "ROCKET_JUGGERNAUT", shapeKey: "CRUISER", name: "Juggernaut", colorHex: "#ff4fd8" },
];
