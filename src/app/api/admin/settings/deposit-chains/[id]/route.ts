import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";

const patchSchema = z.object({
  label: z.string().trim().min(1).optional(),
  tokenContract: z.string().trim().min(1).optional(),
  tokenDecimals: z.number().int().min(0).max(30).optional(),
  minConfirmations: z.number().int().min(0).optional(),
  rpcUrl: z.string().trim().nullable().optional(),
  explorerTxUrl: z.string().trim().nullable().optional(),
  evmChainId: z.number().int().positive().nullable().optional(),
  enabled: z.boolean().optional(),
});

// PATCH /api/admin/settings/deposit-chains/:id — edit or toggle an
// existing chain. chainKey/kind are immutable after creation (changing
// either would silently disconnect it from any already-recorded
// OnchainDeposit.chain rows and its DepositWatcherCursor) — delete and
// re-add instead if those need to change. The address POOL isn't
// managed here — see /api/admin/settings/deposit-chains/[id]/addresses.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const body = parsed.data;

  const existing = await db.depositChainConfig.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Chain not found" }, { status: 404 });

  const isEvm = existing.kind === "EVM";
  if (body.tokenContract && isEvm && !/^0x[a-fA-F0-9]{40}$/.test(body.tokenContract)) {
    return NextResponse.json({ error: "Token contract doesn't look like a valid EVM (0x…) address." }, { status: 400 });
  }

  const updated = await db.depositChainConfig.update({
    where: { id },
    data: {
      label: body.label,
      tokenContract: body.tokenContract ? (isEvm ? body.tokenContract.toLowerCase() : body.tokenContract) : undefined,
      tokenDecimals: body.tokenDecimals,
      minConfirmations: body.minConfirmations,
      rpcUrl: body.rpcUrl === undefined ? undefined : body.rpcUrl?.trim() || null,
      explorerTxUrl: body.explorerTxUrl === undefined ? undefined : body.explorerTxUrl?.trim() || null,
      evmChainId: body.evmChainId,
      enabled: body.enabled,
    },
  });

  return NextResponse.json({ row: updated });
}

// DELETE /api/admin/settings/deposit-chains/:id — removes the config
// row. Historical OnchainDeposit rows keep their recorded chainKey
// string (nothing cascades), they just won't be scanned anymore.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id } = await params;
  const existing = await db.depositChainConfig.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Chain not found" }, { status: 404 });

  await db.depositChainConfig.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
