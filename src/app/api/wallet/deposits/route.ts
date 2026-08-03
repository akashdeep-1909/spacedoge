import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { syncAllDeposits } from "@/lib/deposits";

// GET /api/wallet/deposits — the signed-in wallet's own on-chain
// deposit history (UNMATCHED rows are never returned here since they
// have no walletProfileId to scope by).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  await syncAllDeposits();

  const rows = await db.onchainDeposit.findMany({
    where: { walletProfileId: session.walletProfileId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({
    rows: rows.map((r) => ({
      id: r.id,
      chain: r.chain,
      txHash: r.txHash,
      amount: Number(r.amount),
      confirmations: r.confirmations,
      status: r.status,
      createdAt: r.createdAt,
      creditedAt: r.creditedAt,
    })),
  });
}
