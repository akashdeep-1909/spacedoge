import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";
import { getWalletBalances } from "@/lib/balances";

// PLATFORM_FEE_USDT excluded — that's the treasury's own balance type
// (src/lib/treasury.ts), never something an admin hands to a regular
// user directly.
const CREDITABLE_BALANCE_TYPES = [
  "PLAY_USDT",
  "GAME_REWARD_USDT",
  "PTS",
  "PENDING_DOGE",
  "AVAILABLE_DOGE",
  "RECYCLED_USDT",
  "REFERRAL_USDT",
] as const;

const bodySchema = z.object({
  balanceType: z.enum(CREDITABLE_BALANCE_TYPES),
  // Signed, same convention as every LedgerEntry.amount in this app —
  // positive credits the balance, negative debits/corrects it. Admin
  // types whichever they mean directly, no separate "credit vs debit"
  // toggle needed.
  amount: z.number().finite().refine((n) => n !== 0, "Amount can't be zero"),
  note: z.string().trim().max(280).optional(),
});

// POST /api/admin/users/[id]/credit — manually adds (or removes, via a
// negative amount) a balance for a user, e.g. a support refund or a
// bug-compensation credit. Still just a normal append-only LedgerEntry
// like every other balance change in this app (src/lib/balances.ts:
// "no administrator can directly edit a displayed balance") — this
// creates a new entry, it never rewrites history or a stored balance
// column, and it's attributed to the acting admin + an optional note
// for audit purposes (see LedgerEntry.adminActorAddress/.note).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { balanceType, amount, note } = parsed.data;

  const wallet = await db.walletProfile.findUnique({ where: { id } });
  if (!wallet) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (wallet.address.startsWith("bot:") || wallet.address === "platform:treasury") {
    return NextResponse.json({ error: "Not a real user wallet" }, { status: 400 });
  }

  await db.ledgerEntry.create({
    data: {
      walletProfileId: id,
      balanceType,
      amount,
      reason: "admin_manual_credit",
      adminActorAddress: session.address,
      note: note || null,
    },
  });

  const balances = await getWalletBalances(id);
  return NextResponse.json({ ok: true, balances });
}
