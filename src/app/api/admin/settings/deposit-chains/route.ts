import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";
import { getDepositChainConfigs } from "@/lib/settings";

// GET /api/admin/settings/deposit-chains — every configured deposit
// chain, enabled or not (the user-facing deposit page only sees
// enabled ones — see /api/wallet/deposit-address), each with its full
// address pool. Users are split across a chain's pool by a stateless
// hash (see getDepositAddressForWallet in src/lib/deposits.ts), so
// there's no per-address "assigned to" to show here — just the pool
// itself.
export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  await getDepositChainConfigs(); // triggers the lazy BEP20-from-env seed if nothing exists yet
  const rows = await db.depositChainConfig.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      addresses: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  return NextResponse.json({ rows });
}

const bodySchema = z.object({
  chainKey: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .regex(/^[A-Z0-9_]+$/, "Use uppercase letters, numbers, and underscores only (e.g. BEP20, POLYGON)."),
  label: z.string().trim().min(1),
  kind: z.enum(["EVM", "TRON"]),
  // At least one starting address — a chain with an empty pool can't
  // serve anyone yet. More can always be added afterward via
  // /api/admin/settings/deposit-chains/[id]/addresses.
  addresses: z.array(z.string().trim().min(1)).min(1, "Add at least one deposit address."),
  tokenContract: z.string().trim().min(1),
  tokenDecimals: z.number().int().min(0).max(30),
  minConfirmations: z.number().int().min(0),
  rpcUrl: z.string().trim().nullable().optional(),
  explorerTxUrl: z.string().trim().nullable().optional(),
  evmChainId: z.number().int().positive().nullable().optional(),
});

// POST /api/admin/settings/deposit-chains — add a new deposit chain
// with its starting address pool. This is purely config: an EVM chain
// gets picked up by the generic watcher next sync cycle
// (src/lib/deposits.ts syncEvmChain), a TRON chain by the TronGrid-
// based one — no code deploy needed either way.
export async function POST(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const body = parsed.data;

  const addressRegex = body.kind === "EVM" ? /^0x[a-fA-F0-9]{40}$/ : /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
  const addressLabel = body.kind === "EVM" ? "EVM (0x…)" : "Tron";
  for (const address of body.addresses) {
    if (!addressRegex.test(address)) {
      return NextResponse.json({ error: `"${address}" doesn't look like a valid ${addressLabel} address.` }, { status: 400 });
    }
  }
  if (body.kind === "EVM" && !/^0x[a-fA-F0-9]{40}$/.test(body.tokenContract)) {
    return NextResponse.json({ error: "Token contract doesn't look like a valid EVM (0x…) address." }, { status: 400 });
  }

  const existing = await db.depositChainConfig.findUnique({ where: { chainKey: body.chainKey } });
  if (existing) return NextResponse.json({ error: `A chain with key "${body.chainKey}" already exists.` }, { status: 400 });

  const normalizedAddresses = [...new Set(body.addresses.map((a) => (body.kind === "EVM" ? a.toLowerCase() : a)))];

  const created = await db.depositChainConfig.create({
    data: {
      chainKey: body.chainKey,
      label: body.label,
      kind: body.kind,
      tokenContract: body.kind === "EVM" ? body.tokenContract.toLowerCase() : body.tokenContract,
      tokenDecimals: body.tokenDecimals,
      minConfirmations: body.minConfirmations,
      rpcUrl: body.rpcUrl?.trim() || null,
      explorerTxUrl: body.explorerTxUrl?.trim() || null,
      evmChainId: body.kind === "EVM" ? body.evmChainId ?? null : null,
      addresses: { create: normalizedAddresses.map((address, i) => ({ address, sortOrder: i })) },
    },
    include: { addresses: true },
  });

  return NextResponse.json({ row: created });
}
