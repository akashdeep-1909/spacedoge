import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { ShopItemCategory, ShopEntitlementType } from "@/generated/prisma/enums";
import { SHOP_ROCKET_SHAPE_CATALOG } from "@/lib/shop-shared";

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
// Phase 1 seeds ROCKET_SHAPE items only — every other effect column
// (speedMultBonus, magnetDurationBonusSec, etc.) stays null on every
// row until a later phase adds STAT_SPEED/POWERUP_*/EXTRA_TIME catalog
// entries. See the shop plan for the full phased rollout.
const SEED_DEFAULTS: {
  key: string;
  category: ShopItemCategory;
  label: string;
  description: string;
  priceUsdt: number;
  entitlementType: ShopEntitlementType;
  usesGranted: number | null;
  termDays: number | null;
  shapeKey: string | null;
  sortOrder: number;
}[] = SHOP_ROCKET_SHAPE_CATALOG.map((shape, i) => {
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
    shapeKey: shape.shapeKey,
    sortOrder: i,
  };
});

async function seedShopItemConfigsIfEmpty() {
  const count = await db.shopItemConfig.count();
  if (count > 0) return;
  try {
    await db.shopItemConfig.createMany({ data: SEED_DEFAULTS });
  } catch {
    // Lost a seed race — fine, another concurrent request already created these.
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
// MatchLoadout's own doc-comment in schema.prisma).
export interface ResolvedLoadout {
  shapeKey: string | null;
}

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
export async function consumeLoadoutSelections(
  tx: Prisma.TransactionClient,
  walletProfileId: string,
  matchId: string,
  selections: LoadoutSelectionInput | undefined
): Promise<ResolvedLoadout> {
  const resolved: ResolvedLoadout = { shapeKey: null };
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
    if (category === ShopItemCategory.ROCKET_SHAPE) resolved.shapeKey = item.shapeKey;
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
