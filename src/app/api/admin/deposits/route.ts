import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";
import { DepositStatus } from "@/generated/prisma/enums";
import { syncAllDeposits } from "@/lib/deposits";
import { getDepositChainConfigs, resolveExplorerTxUrl } from "@/lib/settings";

// GET /api/admin/deposits?status=UNMATCHED — every on-chain deposit
// across every wallet (the user-facing /api/wallet/deposits route
// scopes to the caller's own wallet only).
export async function GET(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  await syncAllDeposits();

  const status = request.nextUrl.searchParams.get("status") as DepositStatus | null;
  // Tx-hash lookup ignores status/the 100-row cap — an admin verifying a
  // hash a user reported needs to find it regardless of how old or what
  // status it's in, not just whatever's in the latest page.
  const txHash = request.nextUrl.searchParams.get("txHash")?.trim();
  const [rows, chainConfigs] = await Promise.all([
    db.onchainDeposit.findMany({
      where: txHash ? { txHash: { contains: txHash, mode: "insensitive" } } : status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      take: txHash ? undefined : 100,
      include: { walletProfile: { select: { address: true } } },
    }),
    getDepositChainConfigs(),
  ]);
  const explorerOverrideByChain = new Map(chainConfigs.map((c) => [c.chainKey, c.explorerTxUrl]));

  return NextResponse.json({
    rows: rows.map((r) => ({
      id: r.id,
      chain: r.chain,
      txHash: r.txHash,
      // Resolved server-side per the deposit's actual chain (was
      // previously hardcoded to bscscan.com regardless of chain on the
      // admin UI — fixed here, now correct for TRC20/any future chain
      // too).
      explorerUrl: resolveExplorerTxUrl(r.chain, explorerOverrideByChain.get(r.chain), r.txHash),
      fromAddress: r.fromAddress,
      amount: Number(r.amount),
      confirmations: r.confirmations,
      status: r.status,
      walletAddress: r.walletProfile?.address ?? null,
      createdAt: r.createdAt,
      creditedAt: r.creditedAt,
    })),
  });
}
