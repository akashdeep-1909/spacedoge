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
export const SHOP_ROCKET_SHAPE_CATALOG: { key: string; shapeKey: RocketShapeKey; name: string }[] = [
  { key: "ROCKET_VOYAGER", shapeKey: "VOYAGER", name: "Voyager" },
  { key: "ROCKET_ZEPHYR", shapeKey: "VOYAGER", name: "Zephyr" },
  { key: "ROCKET_INTERCEPTOR", shapeKey: "INTERCEPTOR", name: "Interceptor" },
  { key: "ROCKET_RAPTOR", shapeKey: "INTERCEPTOR", name: "Raptor" },
  { key: "ROCKET_CRUISER", shapeKey: "CRUISER", name: "Cruiser" },
  { key: "ROCKET_JUGGERNAUT", shapeKey: "CRUISER", name: "Juggernaut" },
];
