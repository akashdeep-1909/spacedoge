import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPlatformSettings } from "@/lib/settings";

// GET /api/docs — public, no auth. Returns an empty list whenever the
// menu is switched off, so the site nav (src/components/DocsNavMenu.tsx)
// can just check "any docs?" instead of also tracking the master
// toggle separately.
export async function GET() {
  const settings = await getPlatformSettings();
  if (!settings.docsMenuEnabled) {
    return NextResponse.json({ docs: [] });
  }

  const rows = await db.siteDocument.findMany({
    where: { enabled: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({
    docs: rows.map((row) => ({ id: row.id, title: row.title, fileExt: row.fileExt })),
  });
}
