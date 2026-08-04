import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";

// GET /api/admin/transfers?q=0x... — every user-to-user wallet transfer
// (src/lib/transfers.ts's sendToWallet), searchable by either side's
// address. This is the one real-money channel between two DIFFERENT
// users the app has (same-wallet balance_transfer never leaves a
// user's own account, so it doesn't need this kind of oversight) — see
// the InternalTransfer model's doc-comment in schema.prisma for why it
// gets a dedicated table/view instead of being reconstructed from the
// ledger like every other conversion.
export async function GET(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase();

  const rows = await db.internalTransfer.findMany({
    where: q
      ? {
          OR: [
            { fromWalletProfile: { address: { contains: q, mode: "insensitive" } } },
            { toWalletProfile: { address: { contains: q, mode: "insensitive" } } },
            { fromWalletProfile: { nickname: { contains: q, mode: "insensitive" } } },
            { toWalletProfile: { nickname: { contains: q, mode: "insensitive" } } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      fromWalletProfile: { select: { address: true, nickname: true } },
      toWalletProfile: { select: { address: true, nickname: true } },
    },
  });

  return NextResponse.json({
    rows: rows.map((r) => ({
      id: r.id,
      fromAddress: r.fromWalletProfile.address,
      fromNickname: r.fromWalletProfile.nickname,
      toAddress: r.toWalletProfile.address,
      toNickname: r.toWalletProfile.nickname,
      balanceType: r.balanceType,
      amount: Number(r.amount),
      note: r.note,
      createdAt: r.createdAt,
    })),
  });
}
