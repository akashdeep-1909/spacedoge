import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";

// PATCH /api/admin/settings/game-modes/:id — mode itself is immutable
// (it's the @unique key tying this row to the fixed GameMode enum, see
// the scope-boundary note in prisma/schema.prisma's GameModeConfig
// doc comment) — every other parameter is editable at runtime.
const patchSchema = z.object({
  label: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  entryFeeUsdt: z.number().min(0).optional(),
  durationSec: z.number().int().min(10).max(600).optional(),
  enabled: z.boolean().optional(),
  prefundedPoolUsdt: z.number().min(0).nullable().optional(),
  cooldownHours: z.number().int().min(0).nullable().optional(),
  eligibilityWindowHours: z.number().int().min(1).nullable().optional(),
  eligibilityMinPlays: z.number().int().min(1).nullable().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const body = parsed.data;

  const existing = await db.gameModeConfig.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Game mode not found" }, { status: 404 });

  const updated = await db.gameModeConfig.update({
    where: { id },
    data: {
      label: body.label,
      description: body.description,
      entryFeeUsdt: body.entryFeeUsdt,
      durationSec: body.durationSec,
      enabled: body.enabled,
      prefundedPoolUsdt: body.prefundedPoolUsdt,
      cooldownHours: body.cooldownHours,
      eligibilityWindowHours: body.eligibilityWindowHours,
      eligibilityMinPlays: body.eligibilityMinPlays,
    },
  });

  return NextResponse.json({
    row: {
      id: updated.id,
      mode: updated.mode,
      label: updated.label,
      description: updated.description,
      entryFeeUsdt: Number(updated.entryFeeUsdt),
      durationSec: updated.durationSec,
      enabled: updated.enabled,
      prefundedPoolUsdt: updated.prefundedPoolUsdt !== null ? Number(updated.prefundedPoolUsdt) : null,
      cooldownHours: updated.cooldownHours,
      eligibilityWindowHours: updated.eligibilityWindowHours,
      eligibilityMinPlays: updated.eligibilityMinPlays,
      sortOrder: updated.sortOrder,
    },
  });
}
