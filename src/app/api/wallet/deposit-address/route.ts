import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDepositChainConfigs } from "@/lib/settings";
import { getDepositAddressForWallet } from "@/lib/deposits";

// GET /api/wallet/deposit-address
//
// Returns every enabled deposit chain (multi-chain, admin-configured
// via DepositChainConfig — see src/lib/settings.ts and
// /admin/settings) instead of the old fixed bep20/trc20 two-key shape.
// Each chain's `address` is THIS caller's own address, computed by
// splitting all callers across that chain's address pool (see
// getDepositAddressForWallet) rather than everyone sharing one single
// treasury address. `address` is null only if the admin hasn't added
// any pool address for that chain yet.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const configs = await getDepositChainConfigs({ enabledOnly: true });

  const chains = await Promise.all(
    configs.map(async (c) => {
      const picked = await getDepositAddressForWallet(session.walletProfileId, c.id);
      return {
        chainKey: c.chainKey,
        label: c.label,
        kind: c.kind,
        address: picked?.address ?? null,
        tokenContract: c.tokenContract,
        tokenDecimals: c.tokenDecimals,
        minConfirmations: c.minConfirmations,
        evmChainId: c.evmChainId,
      };
    })
  );

  return NextResponse.json({ chains, sendFromAddress: session.address });
}
