import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";
import { getAllKolVipTiers } from "@/lib/kolVip";

// GET /api/admin/kol-vip/tiers — every KOL VIP tier, enabled or not.
// Lazily seeds the official VIP1-VIP10 ladder on first read (see
// src/lib/kolVip.ts's SEED_TIERS) so a fresh deploy already has the
// full table instead of an empty one an admin has to hand-enter.
export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const rows = await getAllKolVipTiers();
  return NextResponse.json({
    rows: rows.map((r) => ({
      id: r.id,
      key: r.key,
      label: r.label,
      minDirectReferrals: r.minDirectReferrals,
      minIndirectReferrals: r.minIndirectReferrals,
      bonusPct: Number(r.bonusPct),
      enabled: r.enabled,
      sortOrder: r.sortOrder,
    })),
  });
}

// POST /api/admin/kol-vip/tiers — creates a new tier (VIP2, VIP3, ...).
// No delete anywhere for this model — same "disable, never delete"
// rule as ShopItemConfig/GameModeConfig, since a real KolVipPayout row
// will FK-reference a tier once any month has been evaluated against
// it; Disable already fully removes it from future qualification.
const createSchema = z.object({
  label: z.string().trim().min(1),
  minDirectReferrals: z.number().int().min(0),
  minIndirectReferrals: z.number().int().min(0),
  // 0.01 = 1% — the commission rate applied to downline revenue, then
  // split 50/50 between USDT and mining hashrate (see src/lib/kolVip.ts).
  bonusPct: z.number().min(0).max(1),
});

function slugifyKey(label: string): string {
  const slug = label
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `KOLVIP_${slug || "TIER"}_${suffix}`;
}

export async function POST(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const body = parsed.data;

  const sortOrder = (await getAllKolVipTiers()).length; // ensures the seed exists before counting, so a manual add never races the seed
  const created = await db.kolVipTier.create({
    data: {
      key: slugifyKey(body.label),
      label: body.label,
      minDirectReferrals: body.minDirectReferrals,
      minIndirectReferrals: body.minIndirectReferrals,
      bonusPct: body.bonusPct,
      sortOrder,
    },
  });

  return NextResponse.json({
    row: {
      id: created.id,
      key: created.key,
      label: created.label,
      minDirectReferrals: created.minDirectReferrals,
      minIndirectReferrals: created.minIndirectReferrals,
      bonusPct: Number(created.bonusPct),
      enabled: created.enabled,
      sortOrder: created.sortOrder,
    },
  });
}
