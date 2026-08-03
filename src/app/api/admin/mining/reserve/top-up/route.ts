import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";
import { BalanceType } from "@/generated/prisma/enums";
import { getPlatformTreasuryWalletProfileId } from "@/lib/treasury";
import { getMiningProtectionReserveBalanceUsdt } from "@/lib/mining-settings";

const bodySchema = z.object({
  amountUsdt: z.number().positive(),
  note: z.string().trim().max(280).optional(),
});

// POST /api/admin/mining/reserve/top-up — manual admin funding for the
// mining Protection Reserve (doc section 12's suggested 96-128 USDT
// initial seed). Deliberately manual, not a cut of every purchase —
// same "admin-initiated credit" pattern as POST /api/admin/users/[id]/
// credit, just targeting the synthetic treasury wallet's own
// MINING_PROTECTION_RESERVE_USDT balance instead of a real user's.
export async function POST(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { amountUsdt, note } = parsed.data;

  await db.$transaction(async (tx) => {
    const treasuryId = await getPlatformTreasuryWalletProfileId(tx);
    await tx.ledgerEntry.create({
      data: {
        walletProfileId: treasuryId,
        balanceType: BalanceType.MINING_PROTECTION_RESERVE_USDT,
        amount: amountUsdt,
        reason: "mining_reserve_manual_seed",
        adminActorAddress: session.address.toLowerCase(),
        note: note || null,
      },
    });
  });

  const balanceUsdt = await getMiningProtectionReserveBalanceUsdt();
  return NextResponse.json({ ok: true, balanceUsdt });
}
