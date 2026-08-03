import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { getGameModeConfigs } from "@/lib/gameModes";

// GET /api/admin/settings/game-modes — every mode's config, enabled or
// not (unlike the player-facing GET /api/game-modes, which only
// returns enabled + currently-eligible modes).
export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const rows = await getGameModeConfigs();
  return NextResponse.json({
    rows: rows.map((r) => ({
      id: r.id,
      mode: r.mode,
      label: r.label,
      description: r.description,
      entryFeeUsdt: Number(r.entryFeeUsdt),
      durationSec: r.durationSec,
      enabled: r.enabled,
      prefundedPoolUsdt: r.prefundedPoolUsdt !== null ? Number(r.prefundedPoolUsdt) : null,
      cooldownHours: r.cooldownHours,
      eligibilityWindowHours: r.eligibilityWindowHours,
      eligibilityMinPlays: r.eligibilityMinPlays,
      sortOrder: r.sortOrder,
    })),
  });
}
