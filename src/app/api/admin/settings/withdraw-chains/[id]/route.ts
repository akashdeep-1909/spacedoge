import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";

function isValidRegex(source: string): boolean {
  try {
    new RegExp(source);
    return true;
  } catch {
    return false;
  }
}

const patchSchema = z.object({
  label: z.string().trim().min(1).optional(),
  addressRegex: z.string().trim().min(1).optional(),
  explorerTxUrl: z.string().trim().nullable().optional(),
  enabled: z.boolean().optional(),
});

// PATCH /api/admin/settings/withdraw-chains/:id — chainKey/coinSymbol
// are immutable after creation (changing coinSymbol would silently
// change which balance historical Withdrawal rows on this chain
// actually meant) — delete and re-add instead if those need to change.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const body = parsed.data;

  if (body.addressRegex && !isValidRegex(body.addressRegex)) {
    return NextResponse.json({ error: "That address pattern isn't a valid regular expression." }, { status: 400 });
  }

  const existing = await db.withdrawChainConfig.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Chain not found" }, { status: 404 });

  const updated = await db.withdrawChainConfig.update({
    where: { id },
    data: {
      label: body.label,
      addressRegex: body.addressRegex,
      explorerTxUrl: body.explorerTxUrl === undefined ? undefined : body.explorerTxUrl?.trim() || null,
      enabled: body.enabled,
    },
  });

  return NextResponse.json({ row: updated });
}

// DELETE /api/admin/settings/withdraw-chains/:id
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id } = await params;
  const existing = await db.withdrawChainConfig.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Chain not found" }, { status: 404 });

  await db.withdrawChainConfig.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
