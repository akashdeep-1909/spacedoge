import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";

const bodySchema = z.object({
  addresses: z.array(z.string().trim().min(1)).min(1),
});

// POST /api/admin/settings/deposit-chains/:id/addresses — grow a
// chain's deposit address pool. Every unassigned address here is a
// candidate the NEXT user with no assignment yet for this chain can be
// handed (see getOrAssignDepositAddress in src/lib/deposits.ts) —
// adding more never touches any wallet's existing assignment.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id } = await params;
  const chain = await db.depositChainConfig.findUnique({ where: { id } });
  if (!chain) return NextResponse.json({ error: "Chain not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const addressRegex = chain.kind === "EVM" ? /^0x[a-fA-F0-9]{40}$/ : /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
  const addressLabel = chain.kind === "EVM" ? "EVM (0x…)" : "Tron";
  const normalized = [
    ...new Set(parsed.data.addresses.map((a) => (chain.kind === "EVM" ? a.toLowerCase() : a))),
  ];
  for (const address of normalized) {
    if (!addressRegex.test(address)) {
      return NextResponse.json({ error: `"${address}" doesn't look like a valid ${addressLabel} address.` }, { status: 400 });
    }
  }

  const existingCount = await db.depositTreasuryAddress.count({ where: { chainConfigId: id } });
  const created = await db.depositTreasuryAddress.createMany({
    data: normalized.map((address, i) => ({ chainConfigId: id, address, sortOrder: existingCount + i })),
    skipDuplicates: true, // the chainConfigId+address unique pair — re-adding an existing one is a silent no-op, not an error
  });

  return NextResponse.json({ added: created.count });
}
