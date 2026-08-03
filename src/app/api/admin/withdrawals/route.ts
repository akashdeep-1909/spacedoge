import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";
import { getWithdrawChainConfigs, resolveExplorerTxUrl } from "@/lib/settings";

// GET /api/admin/withdrawals — every withdrawal platform-wide, newest
// first. PENDING ones are the admin's queue: send the real on-chain
// transaction outside this app, then complete it here via
// /api/admin/withdrawals/[id]/complete.
export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const [rows, chainConfigs] = await Promise.all([
    db.withdrawal.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { walletProfile: { select: { address: true } } },
    }),
    getWithdrawChainConfigs(),
  ]);
  const explorerOverrideByChain = new Map(chainConfigs.map((c) => [c.chainKey, c.explorerTxUrl]));

  return NextResponse.json({
    rows: rows.map((w) => ({
      id: w.id,
      address: w.walletProfile.address,
      balanceType: w.balanceType,
      chain: w.chain,
      destinationAddress: w.destinationAddress,
      amount: Number(w.amount),
      networkFeeUsdt: w.networkFeeUsdt !== null ? Number(w.networkFeeUsdt) : null,
      status: w.status,
      txHash: w.txHash,
      // Resolved server-side (WithdrawChainConfig override, falling
      // back to a small built-in default per chainKey) so the admin UI
      // never has to guess which explorer a given chain uses.
      explorerUrl: w.txHash ? resolveExplorerTxUrl(w.chain, explorerOverrideByChain.get(w.chain), w.txHash) : null,
      createdAt: w.createdAt,
      completedAt: w.completedAt,
    })),
  });
}
