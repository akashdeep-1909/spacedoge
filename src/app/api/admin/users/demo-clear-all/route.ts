import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";

// POST /api/admin/users/demo-clear-all — resets EVERY currently
// demo-flagged wallet back to a real user in one call. Exists
// specifically for undoing a bulk-mark test/mistake (src/app/admin/
// users/page.tsx's own "Bulk mark demo accounts" panel) — confirmed
// live as a real need: an admin used that panel to try it out, ended
// up with 100+ real wallets flagged demo, and had no way back short of
// manually re-gathering every one of those addresses to paste into the
// same box again. This is the one-button undo for exactly that.
export async function POST() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  try {
    const result = await db.walletProfile.updateMany({ where: { isDemo: true }, data: { isDemo: false } });
    return NextResponse.json({ clearedCount: result.count });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to clear demo flags" }, { status: 500 });
  }
}
