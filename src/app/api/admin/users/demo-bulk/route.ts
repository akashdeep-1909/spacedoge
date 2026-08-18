import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";

// POST /api/admin/users/demo-bulk — mark (or unmark) many wallets as
// demo/marketing accounts at once, from a pasted list of identifiers.
// Each identifier can be EITHER a WalletProfile.id (the internal cuid,
// e.g. shown on that user's own /admin/users/[id] page) OR a wallet
// address (0x...) — src/app/admin/users/page.tsx's own bulk-mark box
// doesn't force the admin to pick one format, it accepts whatever they
// already have on hand (a spreadsheet of addresses, or IDs copied off
// this admin panel itself).
const bodySchema = z.object({
  identifiers: z.array(z.string().trim().min(1)).min(1),
  isDemo: z.boolean(),
});

export async function POST(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const identifiers = [...new Set(parsed.data.identifiers.map((s) => s.toLowerCase()))];

  // Resolved first (rather than a single blind updateMany) so the
  // response can tell the admin exactly which pasted lines didn't
  // match anything — a silent no-op on a typo'd address/id would
  // otherwise look identical to success.
  const matched = await db.walletProfile.findMany({
    where: { OR: [{ id: { in: identifiers } }, { address: { in: identifiers } }] },
    select: { id: true, address: true },
  });

  if (matched.length > 0) {
    await db.walletProfile.updateMany({
      where: { id: { in: matched.map((m) => m.id) } },
      data: { isDemo: parsed.data.isDemo },
    });
  }

  const matchedSet = new Set(matched.flatMap((m) => [m.id.toLowerCase(), m.address.toLowerCase()]));
  const unmatched = identifiers.filter((i) => !matchedSet.has(i));

  return NextResponse.json({ updatedCount: matched.length, unmatched });
}
