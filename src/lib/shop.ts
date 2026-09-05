import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { ShopItemCategory, ShopEntitlementType } from "@/generated/prisma/enums";
import { SHOP_ROCKET_SHAPE_CATALOG, type ResolvedLoadout } from "@/lib/shop-shared";
export type { ResolvedLoadout };

// Selected equipment for one match, keyed by category — POST /api/matches'
// own `loadout` request field, one walletShopItemId at most per
// category (mirrors MatchLoadoutSelection's own unique constraint).
export type LoadoutSelectionInput = Partial<Record<ShopItemCategory, string>>;

// Admin-editable shop catalog — DB-backed, lazily seeded from the exact
// values below, same lazy-seed-on-first-read convention as
// src/lib/gameModes.ts's seedGameModeConfigsIfEmpty()/getGameModeConfig()
// and src/lib/settings.ts's seedWithdrawChainsIfEmpty(). Nothing changes
// behaviorally until an admin actually edits a row via /admin/shop.
//
// Phase 2 (this file, current state): rocket skins (cosmetic shape +
// color, zero gameplay effect — see shop-shared.ts's own doc-comment
// on why that's a hard rule) PLUS one seed item per real stat/power-up
// category, each an upgrade to a mechanic that's already free and
// built into every match (Magnet/Shield/Boost/Fire — see
// CoinRushArena.tsx's useMagnet/useShield/useOverclock/useFire) or a
// permanent whole-match bonus (Speed/Health). EXTRA_TIME stays
// unseeded — out of scope this phase, see the plan's own doc-comment.
type SeedRow = {
  key: string;
  category: ShopItemCategory;
  label: string;
  description: string;
  priceUsdt: number;
  entitlementType: ShopEntitlementType;
  usesGranted: number | null;
  termDays: number | null;
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
  sortOrder: number;
};

const NO_EFFECTS = {
  shapeKey: null,
  colorHex: null,
  speedMultBonus: null,
  livesBonus: null,
  magnetDurationBonusSec: null,
  magnetCooldownDeltaSec: null,
  fireExtraUses: null,
  fireDurationBonusSec: null,
  shieldDurationBonusSec: null,
  shieldCooldownDeltaSec: null,
} as const;

const ROCKET_SEEDS: SeedRow[] = SHOP_ROCKET_SHAPE_CATALOG.map((shape, i) => {
  // Alternates entitlement type across the 6 seed rows so both pricing
  // models (a fixed number of games, and a day-limited pass) are live
  // and exercised end to end from day one, matching the user's own
  // framing ("charge for this for number of games only and time limit
  // like 3 days, 7 days") rather than shipping only one of the two.
  const useTimeWindow = i % 2 === 0;
  return {
    key: shape.key,
    category: ShopItemCategory.ROCKET_SHAPE,
    label: `${shape.name} Rocket`,
    description: useTimeWindow
      ? `A ${shape.name.toLowerCase()}-class rocket skin — purely cosmetic, no gameplay effect. Usable in every match for a limited time after purchase.`
      : `A ${shape.name.toLowerCase()}-class rocket skin — purely cosmetic, no gameplay effect. Usable for a fixed number of matches after purchase.`,
    priceUsdt: useTimeWindow ? 0.75 + i * 0.15 : 0.5 + i * 0.1,
    entitlementType: useTimeWindow ? ShopEntitlementType.TIME_WINDOW : ShopEntitlementType.USES,
    usesGranted: useTimeWindow ? null : 15 + i * 5,
    termDays: useTimeWindow ? (i % 4 === 0 ? 7 : 3) : null,
    ...NO_EFFECTS,
    shapeKey: shape.shapeKey,
    colorHex: shape.colorHex,
    sortOrder: i,
  };
});

// One seed item per real gameplay category — admin can add more of the
// same category later (different price/duration/uses combos), these
// just make sure the shop isn't empty on first load.
const STAT_POWERUP_SEEDS: SeedRow[] = [
  {
    key: "SPEED_NITRO_ENGINE",
    category: ShopItemCategory.STAT_SPEED,
    label: "Nitro Engine",
    description: "Permanently boosts your ship's top speed for the whole match — stacks with the in-game Boost button.",
    priceUsdt: 1.25,
    entitlementType: ShopEntitlementType.USES,
    usesGranted: 20,
    termDays: null,
    ...NO_EFFECTS,
    speedMultBonus: 0.1,
    sortOrder: 100,
  },
  {
    key: "HEALTH_REINFORCED_HULL",
    category: ShopItemCategory.STAT_HEALTH,
    label: "Reinforced Hull",
    description: "Grants 1 extra life at the start of every match you use it in.",
    priceUsdt: 1.5,
    entitlementType: ShopEntitlementType.TIME_WINDOW,
    usesGranted: null,
    termDays: 7,
    ...NO_EFFECTS,
    livesBonus: 1,
    sortOrder: 101,
  },
  {
    key: "MAGNET_OVERCHARGE",
    category: ShopItemCategory.POWERUP_MAGNET,
    label: "Magnet Overcharge",
    description: "Makes your Magnet power-up last longer and recharge faster.",
    priceUsdt: 1.0,
    entitlementType: ShopEntitlementType.USES,
    usesGranted: 25,
    termDays: null,
    ...NO_EFFECTS,
    magnetDurationBonusSec: 2.5,
    magnetCooldownDeltaSec: -4,
    sortOrder: 102,
  },
  {
    key: "FIRE_EXTRA_AMMO",
    category: ShopItemCategory.POWERUP_FIRE,
    label: "Extra Ammo",
    description: "Lets you use Fire one additional time per match, and burns longer each time.",
    priceUsdt: 1.75,
    entitlementType: ShopEntitlementType.TIME_WINDOW,
    usesGranted: null,
    termDays: 3,
    ...NO_EFFECTS,
    fireExtraUses: 1,
    fireDurationBonusSec: 3,
    sortOrder: 103,
  },
  {
    key: "SHIELD_CAPACITOR",
    category: ShopItemCategory.POWERUP_SHIELD,
    label: "Shield Capacitor",
    description: "Makes your Shield power-up last longer and recharge faster.",
    priceUsdt: 1.1,
    entitlementType: ShopEntitlementType.USES,
    usesGranted: 25,
    termDays: null,
    ...NO_EFFECTS,
    shieldDurationBonusSec: 2,
    shieldCooldownDeltaSec: -5,
    sortOrder: 104,
  },
];

const SEED_DEFAULTS: SeedRow[] = [...ROCKET_SEEDS, ...STAT_POWERUP_SEEDS];

// Backfills whichever seed rows don't exist yet, by key — NOT gated on
// "table is completely empty." An environment that already ran Phase
// 1 (rocket skins only) has 6 real rows already, so a bare
// count-is-zero check would never insert the 5 new STAT_POWERUP_SEEDS
// rows added in Phase 2. This runs the same lookup either way (a fresh
// DB just has every key missing, so the effect is identical there),
// and is safe to call on every read — an admin who's since edited or
// disabled a seed row is untouched, this only ever inserts rows whose
// key doesn't exist at all yet.
//
// Also separately backfills colorHex specifically on the ORIGINAL 6
// Phase 1 rocket rows, which is a genuinely different situation from
// "row doesn't exist": those rows exist already (created before
// colorHex existed at all) with colorHex still null, so the "insert
// only if key is missing" logic above would never touch them — without
// this, every environment that ran Phase 1 before this feature shipped
// would show all 6 stock rocket skins in the same fallback gold,
// defeating the entire point of adding per-item color. Only ever fills
// in an actually-null value with the seed's own original color, never
// overwrites a real (non-null) value — there's no admin-facing "edit
// color" action yet, so the only way colorHex could already be
// non-null here is this same backfill having already run.
//
// shapeKey gets the same treatment, but UNCONDITIONALLY re-synced
// (not "only if some other value is missing/null") specifically for
// these 6 known, app-owned seed keys: the "sci-fi mixed fleet"
// redesign (6 genuinely distinct silhouettes replacing the old 3
// same-ship-different-proportions model) reassigned which shape each
// of these 6 SKUs grants — e.g. ROCKET_ZEPHYR went from the old
// "VOYAGER" geometry key to the real "SAUCER" shape — and an existing
// row's shapeKey column still has the stale pre-redesign value stored,
// which would otherwise never update since these rows already exist
// (the "insert only if key is missing" logic above never touches
// them). Safe specifically because: (1) these exact 6 keys are only
// ever created by this seed code, never admin-typed (an admin-created
// custom rocket item gets a random suffixed key, e.g.
// ROCKET_XYZ_AB12CD, which can never collide with one of these 6); (2)
// shapeKey is still fully immutable via the admin PATCH route — this
// is a one-time code-level migration accompanying a code change, the
// same category as the colorHex backfill above, not a new admin
// capability; (3) already-ISSUED WalletShopItem rows from past
// purchases keep whatever shapeKey they snapshotted at purchase time
// regardless — only the ShopItemConfig CATALOG row (governing what a
// NEW purchase gets) changes, exactly the same "catalog edits only
// affect future purchases" principle price/usesGranted/termDays edits
// already rely on.
async function seedShopItemConfigsIfEmpty() {
  const existing = await db.shopItemConfig.findMany({ select: { id: true, key: true, colorHex: true, shapeKey: true } });
  const existingByKey = new Map(existing.map((r) => [r.key, r]));

  const missing = SEED_DEFAULTS.filter((row) => !existingByKey.has(row.key));
  if (missing.length > 0) {
    try {
      await db.shopItemConfig.createMany({ data: missing });
    } catch {
      // Lost a seed race — fine, another concurrent request already created these.
    }
  }

  for (const seed of ROCKET_SEEDS) {
    const row = existingByKey.get(seed.key);
    if (!row) continue;
    const needsColor = row.colorHex === null && seed.colorHex !== null;
    const needsShape = row.shapeKey !== seed.shapeKey;
    if (!needsColor && !needsShape) continue;
    await db.shopItemConfig
      .update({
        where: { id: row.id },
        data: { ...(needsColor ? { colorHex: seed.colorHex } : {}), ...(needsShape ? { shapeKey: seed.shapeKey } : {}) },
      })
      .catch(() => {
        // Non-fatal — another concurrent request may have already backfilled this same row.
      });
  }
}

export async function getShopItemConfigs(opts: { enabledOnly?: boolean } = {}) {
  await seedShopItemConfigsIfEmpty();
  return db.shopItemConfig.findMany({
    where: opts.enabledOnly ? { enabled: true } : undefined,
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function getShopItemConfig(id: string) {
  await seedShopItemConfigsIfEmpty();
  return db.shopItemConfig.findUnique({ where: { id } });
}

// Every effect column an owned WalletShopItem/ShopItemConfig row can
// carry — shared shape so purchase/consumption code copies verbatim
// from config to owned-item without hand-listing the same 10 fields
// in multiple places.
export type ShopItemEffectFields = Pick<
  Prisma.ShopItemConfigGetPayload<object>,
  | "shapeKey"
  | "colorHex"
  | "speedMultBonus"
  | "livesBonus"
  | "magnetDurationBonusSec"
  | "magnetCooldownDeltaSec"
  | "fireExtraUses"
  | "fireDurationBonusSec"
  | "shieldDurationBonusSec"
  | "shieldCooldownDeltaSec"
  | "extraTimeSec"
>;

export function pickEffectFields(cfg: ShopItemEffectFields): ShopItemEffectFields {
  return {
    shapeKey: cfg.shapeKey,
    colorHex: cfg.colorHex,
    speedMultBonus: cfg.speedMultBonus,
    livesBonus: cfg.livesBonus,
    magnetDurationBonusSec: cfg.magnetDurationBonusSec,
    magnetCooldownDeltaSec: cfg.magnetCooldownDeltaSec,
    fireExtraUses: cfg.fireExtraUses,
    fireDurationBonusSec: cfg.fireDurationBonusSec,
    shieldDurationBonusSec: cfg.shieldDurationBonusSec,
    shieldCooldownDeltaSec: cfg.shieldCooldownDeltaSec,
    extraTimeSec: cfg.extraTimeSec,
  };
}

// What actually got equipped, resolved server-side — this is the ONLY
// thing settlement/CoinRushArena should ever trust for "what loadout
// applied to this match," never a client's own claim (see
// MatchLoadout's own doc-comment in schema.prisma). ResolvedLoadout
// itself lives in shop-shared.ts (a client-safe file) so CoinRushArena
// and dashboard/play/page.tsx can import the exact same shape this
// resolves into, without pulling this server-only file (imports `db`)
// into the browser bundle. One field per sellable effect, populated
// straight from whichever category each valid selection belongs to —
// at most one selection per category (MatchLoadoutSelection's own
// unique constraint), so this is always a direct copy, never a sum
// across multiple items of the same kind. extraTimeSec is deliberately
// absent — EXTRA_TIME items are out of scope for this phase (would
// need anti-cheat ceiling/settlement changes not otherwise implied).
const EMPTY_LOADOUT: ResolvedLoadout = {
  shapeKey: null,
  colorHex: null,
  speedMultBonus: null,
  livesBonus: null,
  magnetDurationBonusSec: null,
  magnetCooldownDeltaSec: null,
  fireExtraUses: null,
  fireDurationBonusSec: null,
  shieldDurationBonusSec: null,
  shieldCooldownDeltaSec: null,
};

// Validates + consumes a wallet's requested loadout selections into a
// real MatchLoadout/MatchLoadoutSelection audit record, INSIDE the
// caller's own already-open, already-wallet-locked transaction (POST
// /api/matches, and — once lobby support is added — finalizeLobby()).
// Silently drops (does not error the whole match-creation request for)
// any selection that turns out to be unowned/inactive/expired/
// exhausted by the time this actually runs — a stale client-side
// inventory snapshot (item expired between page load and tapping Play)
// should degrade to "just don't equip that one," not block starting a
// match entirely. USES-type items have usesRemaining decremented by 1
// here, flipping `active` false once it hits 0 — the one place that
// counter is ever touched.
// Copies whichever effect field(s) an item's category actually carries
// onto `resolved` — every other field on `item` for a given category
// is null anyway (see ShopItemConfig's own doc-comment), so this could
// safely copy everything unconditionally; switching on category
// instead keeps the intent explicit and matches pickEffectFields' own
// per-category framing. Shared by consumeLoadoutSelections (the
// match-creation path) and getResolvedLoadoutForMatch below (the
// resume-after-refresh path) so the two can never resolve the same
// stored selection into two different results.
function applyItemEffect(resolved: ResolvedLoadout, category: ShopItemCategory, item: ShopItemEffectFields) {
  switch (category) {
    case ShopItemCategory.ROCKET_SHAPE:
      resolved.shapeKey = item.shapeKey;
      resolved.colorHex = item.colorHex;
      break;
    case ShopItemCategory.STAT_SPEED:
      resolved.speedMultBonus = item.speedMultBonus !== null ? Number(item.speedMultBonus) : null;
      break;
    case ShopItemCategory.STAT_HEALTH:
      resolved.livesBonus = item.livesBonus;
      break;
    case ShopItemCategory.POWERUP_MAGNET:
      resolved.magnetDurationBonusSec = item.magnetDurationBonusSec !== null ? Number(item.magnetDurationBonusSec) : null;
      resolved.magnetCooldownDeltaSec = item.magnetCooldownDeltaSec !== null ? Number(item.magnetCooldownDeltaSec) : null;
      break;
    case ShopItemCategory.POWERUP_FIRE:
      resolved.fireExtraUses = item.fireExtraUses;
      resolved.fireDurationBonusSec = item.fireDurationBonusSec !== null ? Number(item.fireDurationBonusSec) : null;
      break;
    case ShopItemCategory.POWERUP_SHIELD:
      resolved.shieldDurationBonusSec = item.shieldDurationBonusSec !== null ? Number(item.shieldDurationBonusSec) : null;
      resolved.shieldCooldownDeltaSec = item.shieldCooldownDeltaSec !== null ? Number(item.shieldCooldownDeltaSec) : null;
      break;
    case ShopItemCategory.EXTRA_TIME:
      // Out of scope this phase — accepted as a valid selection (so a
      // future phase can light it up with zero changes here) but its
      // effect is never resolved/applied.
      break;
  }
}

export async function consumeLoadoutSelections(
  tx: Prisma.TransactionClient,
  walletProfileId: string,
  matchId: string,
  selections: LoadoutSelectionInput | undefined
): Promise<ResolvedLoadout> {
  const resolved: ResolvedLoadout = { ...EMPTY_LOADOUT };
  if (!selections) return resolved;

  const entries = Object.entries(selections) as [ShopItemCategory, string][];
  if (entries.length === 0) return resolved;

  const now = new Date();
  const validSelections: { category: ShopItemCategory; walletShopItemId: string }[] = [];

  for (const [category, walletShopItemId] of entries) {
    const item = await tx.walletShopItem.findUnique({ where: { id: walletShopItemId } });
    if (!item || item.walletProfileId !== walletProfileId || item.category !== category || !item.active) continue;
    if (item.expiresAt !== null && item.expiresAt <= now) {
      await tx.walletShopItem.update({ where: { id: item.id }, data: { active: false } });
      continue;
    }
    if (item.usesRemaining !== null) {
      if (item.usesRemaining <= 0) {
        await tx.walletShopItem.update({ where: { id: item.id }, data: { active: false } });
        continue;
      }
      const nextUses = item.usesRemaining - 1;
      await tx.walletShopItem.update({
        where: { id: item.id },
        data: { usesRemaining: nextUses, active: nextUses > 0 },
      });
    }
    validSelections.push({ category, walletShopItemId: item.id });
    applyItemEffect(resolved, category, item);
  }

  if (validSelections.length === 0) return resolved;

  const loadout = await tx.matchLoadout.create({ data: { matchId, walletProfileId } });
  await tx.matchLoadoutSelection.createMany({
    data: validSelections.map((s) => ({
      matchLoadoutId: loadout.id,
      walletShopItemId: s.walletShopItemId,
      category: s.category,
    })),
  });

  return resolved;
}

// Rebuilds the exact ResolvedLoadout a match started with, straight
// from the durable MatchLoadoutSelection audit trail — used by GET
// /api/matches/active so resuming a match after a page refresh (or
// disconnect/reconnect) restores whatever was actually equipped/paid
// for, instead of silently reverting to base stats for the rest of the
// match. Read-only, no wallet lock needed (nothing here mutates
// anything — the items were already consumed once, at creation time).
export async function getResolvedLoadoutForMatch(matchId: string, walletProfileId: string): Promise<ResolvedLoadout> {
  const resolved: ResolvedLoadout = { ...EMPTY_LOADOUT };
  const selections = await db.matchLoadoutSelection.findMany({
    where: { matchLoadout: { matchId, walletProfileId } },
    include: { walletShopItem: true },
  });
  for (const sel of selections) {
    applyItemEffect(resolved, sel.category, sel.walletShopItem);
  }
  return resolved;
}
