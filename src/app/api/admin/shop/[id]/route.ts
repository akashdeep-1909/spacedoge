import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";

// PATCH /api/admin/shop/:id — category, entitlementType itself, and
// every true "effect" column (shapeKey, colorHex, speedMultBonus,
// livesBonus, magnet/fire/shield bonuses) are immutable here, same
// scope boundary as GameModeConfig's own admin editor: those columns
// are what a WalletShopItem purchase snapshots verbatim, so changing
// them on the catalog row after the fact would silently redefine what
// items already sold actually do without touching what was sold.
//
// usesGranted/termDays are editable, same reasoning priceUsdt already
// follows: a purchase already snapshots the number it got at purchase
// time onto its own WalletShopItem row (usesRemaining/expiresAt), so
// raising or lowering "20 matches" to "30 matches" here only ever
// changes what a NEW purchase gets — exactly like a price change. Only
// the field matching the row's own existing entitlementType is
// accepted (usesGranted for a USES row, termDays for a TIME_WINDOW
// row) — the OTHER one is rejected rather than silently ignored, so a
// client bug can never write a number into the field this row's
// pricing model doesn't actually use.
const patchSchema = z
  .object({
    label: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    priceUsdt: z.number().min(0).optional(),
    usesGranted: z.number().int().positive().optional(),
    termDays: z.number().int().positive().optional(),
    enabled: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const body = parsed.data;

  const existing = await db.shopItemConfig.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Shop item not found" }, { status: 404 });

  if (body.usesGranted !== undefined && existing.entitlementType !== "USES") {
    return NextResponse.json({ error: "usesGranted only applies to a USES-type item" }, { status: 400 });
  }
  if (body.termDays !== undefined && existing.entitlementType !== "TIME_WINDOW") {
    return NextResponse.json({ error: "termDays only applies to a TIME_WINDOW-type item" }, { status: 400 });
  }

  const updated = await db.shopItemConfig.update({
    where: { id },
    data: {
      label: body.label,
      description: body.description,
      priceUsdt: body.priceUsdt,
      usesGranted: body.usesGranted,
      termDays: body.termDays,
      enabled: body.enabled,
      sortOrder: body.sortOrder,
    },
  });

  return NextResponse.json({
    row: {
      id: updated.id,
      key: updated.key,
      category: updated.category,
      label: updated.label,
      description: updated.description,
      priceUsdt: Number(updated.priceUsdt),
      entitlementType: updated.entitlementType,
      usesGranted: updated.usesGranted,
      termDays: updated.termDays,
      shapeKey: updated.shapeKey,
      colorHex: updated.colorHex,
      speedMultBonus: updated.speedMultBonus !== null ? Number(updated.speedMultBonus) : null,
      livesBonus: updated.livesBonus,
      magnetDurationBonusSec: updated.magnetDurationBonusSec !== null ? Number(updated.magnetDurationBonusSec) : null,
      magnetCooldownDeltaSec: updated.magnetCooldownDeltaSec !== null ? Number(updated.magnetCooldownDeltaSec) : null,
      fireExtraUses: updated.fireExtraUses,
      fireDurationBonusSec: updated.fireDurationBonusSec !== null ? Number(updated.fireDurationBonusSec) : null,
      shieldDurationBonusSec: updated.shieldDurationBonusSec !== null ? Number(updated.shieldDurationBonusSec) : null,
      shieldCooldownDeltaSec: updated.shieldCooldownDeltaSec !== null ? Number(updated.shieldCooldownDeltaSec) : null,
      enabled: updated.enabled,
      sortOrder: updated.sortOrder,
    },
  });
}
