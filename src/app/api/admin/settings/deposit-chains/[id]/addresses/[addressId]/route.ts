import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";

// DELETE /api/admin/settings/deposit-chains/:id/addresses/:addressId —
// removes one address from the pool. Since which address a wallet sees
// is computed on demand from however many exist (see
// getDepositAddressForWallet in src/lib/deposits.ts), deleting one just
// changes that computation going forward — any wallet currently split
// onto it lands on a different pool address next time it checks.
// Historical OnchainDeposit rows are untouched — toAddress there is a
// recorded string, not a foreign key to this table.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; addressId: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id, addressId } = await params;
  const existing = await db.depositTreasuryAddress.findFirst({ where: { id: addressId, chainConfigId: id } });
  if (!existing) return NextResponse.json({ error: "Address not found" }, { status: 404 });

  await db.depositTreasuryAddress.delete({ where: { id: addressId } });
  return NextResponse.json({ ok: true });
}
