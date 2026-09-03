import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";

// PATCH /api/admin/kol-vip/tiers/:id — every editable field, live. A
// KolVipPayout row snapshots qualifiedDirectCount/qualifiedIndirectCount/
// downlineProfitUsdt/downlineHashrateMhs/bonusUsdt/bonusHashrateMhs at
// evaluation time, so changing a tier's thresholds or bonusPct here
// never retroactively changes what an already-evaluated month paid —
// only future months read the live row.
const patchSchema = z.object({
  label: z.string().trim().min(1).optional(),
  minDirectReferrals: z.number().int().min(0).optional(),
  minIndirectReferrals: z.number().int().min(0).optional(),
  bonusPct: z.number().min(0).max(1).optional(),
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

  const existing = await db.kolVipTier.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Tier not found" }, { status: 404 });

  const updated = await db.kolVipTier.update({
    where: { id },
    data: {
      label: body.label,
      minDirectReferrals: body.minDirectReferrals,
      minIndirectReferrals: body.minIndirectReferrals,
      bonusPct: body.bonusPct,
      enabled: body.enabled,
      sortOrder: body.sortOrder,
    },
  });

  return NextResponse.json({
    row: {
      id: updated.id,
      key: updated.key,
      label: updated.label,
      minDirectReferrals: updated.minDirectReferrals,
      minIndirectReferrals: updated.minIndirectReferrals,
      bonusPct: Number(updated.bonusPct),
      enabled: updated.enabled,
      sortOrder: updated.sortOrder,
    },
  });
}
