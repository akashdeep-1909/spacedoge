import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";

// PATCH /api/admin/shop/:id — category/entitlementType/effect fields
// (shapeKey, usesGranted, termDays, ...) are immutable here, same
// scope boundary as GameModeConfig's own admin editor: those columns
// are what a WalletShopItem purchase snapshots verbatim, so changing
// them on the catalog row after the fact would silently redefine what
// items already sold actually do without touching what was sold.
// Only the presentation/commercial knobs — label, description, price,
// enabled, sort order — are editable at runtime.
const patchSchema = z.object({
  label: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  priceUsdt: z.number().min(0).optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const body = parsed.data;

  const existing = await db.shopItemConfig.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Shop item not found" }, { status: 404 });

  const updated = await db.shopItemConfig.update({
    where: { id },
    data: {
      label: body.label,
      description: body.description,
      priceUsdt: body.priceUsdt,
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
      enabled: updated.enabled,
      sortOrder: updated.sortOrder,
    },
  });
}
