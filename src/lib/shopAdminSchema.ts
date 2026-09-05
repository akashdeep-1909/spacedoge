import { z } from "zod";
import { ROCKET_SHAPES } from "@/lib/shop-shared";

// POST /api/admin/shop's create-item validation, factored out of that
// route file specifically because Next's route-handler type checker in
// this version rejects any named export from a route.ts other than the
// HTTP method handlers themselves (GET/POST/etc.) — confirmed live via
// a real tsc error ("Property 'createSchema' is incompatible with
// index signature") the moment this lived inline there. Lives here
// instead so both the route AND scripts/smoke-test-shop-phase2.ts (no
// real admin session available in a script, so it asserts this schema
// directly) can import the exact same validation.
//
// One variant per sellable category (a discriminated union on
// `category` — each variant only requires the fields that category
// actually uses, same spirit as GameModeConfig's own per-mode admin
// form). Common to every variant: label/description/price/pricing-
// model, validated by the same usesGranted/termDays refine every
// category shares.
//
// magnetCooldownReductionSec/shieldCooldownReductionSec are admin-
// facing POSITIVE numbers ("shorten the cooldown by this many
// seconds") — the route negates them into the actual stored
// magnetCooldownDeltaSec/shieldCooldownDeltaSec columns (negative =
// shorter cooldown, per those columns' own doc-comment in
// schema.prisma) so an admin never has to type a negative number to
// mean "better."
const baseFields = {
  label: z.string().trim().min(1),
  description: z.string().trim().min(1),
  priceUsdt: z.number().positive(),
  entitlementType: z.enum(["USES", "TIME_WINDOW"]),
  usesGranted: z.number().int().positive().nullable().optional(),
  termDays: z.number().int().positive().nullable().optional(),
};

export const createShopItemSchema = z
  .discriminatedUnion("category", [
    z.object({
      category: z.literal("ROCKET_SHAPE"),
      shapeKey: z.enum(ROCKET_SHAPES),
      colorHex: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, "colorHex must be a 6-digit hex color, e.g. #f4c15d"),
      ...baseFields,
    }),
    z.object({
      category: z.literal("STAT_SPEED"),
      // A whole-number percent (e.g. 10 => +10% top speed) — stored as
      // the fraction speedMultBonus expects (0.10).
      speedPct: z.number().positive().max(200),
      ...baseFields,
    }),
    z.object({
      category: z.literal("STAT_HEALTH"),
      livesBonus: z.number().int().positive().max(10),
      ...baseFields,
    }),
    z.object({
      category: z.literal("POWERUP_MAGNET"),
      magnetDurationBonusSec: z.number().min(0).max(60),
      magnetCooldownReductionSec: z.number().min(0).max(30),
      ...baseFields,
    }),
    z.object({
      category: z.literal("POWERUP_FIRE"),
      fireExtraUses: z.number().int().min(0).max(10),
      fireDurationBonusSec: z.number().min(0).max(60),
      ...baseFields,
    }),
    z.object({
      category: z.literal("POWERUP_SHIELD"),
      shieldDurationBonusSec: z.number().min(0).max(60),
      shieldCooldownReductionSec: z.number().min(0).max(30),
      ...baseFields,
    }),
  ])
  .refine((v) => (v.entitlementType === "USES" ? !!v.usesGranted : true), {
    message: "usesGranted is required for a USES-type item",
    path: ["usesGranted"],
  })
  .refine((v) => (v.entitlementType === "TIME_WINDOW" ? !!v.termDays : true), {
    message: "termDays is required for a TIME_WINDOW-type item",
    path: ["termDays"],
  });

export const SHOP_ITEM_KEY_PREFIX: Record<z.infer<typeof createShopItemSchema>["category"], string> = {
  ROCKET_SHAPE: "ROCKET",
  STAT_SPEED: "SPEED",
  STAT_HEALTH: "HEALTH",
  POWERUP_MAGNET: "MAGNET",
  POWERUP_FIRE: "FIRE",
  POWERUP_SHIELD: "SHIELD",
};
