import { NextRequest, NextResponse } from "next/server";
import { unlink } from "node:fs/promises";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";
import { docFilePath } from "@/lib/docsStorage";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

// PATCH /api/admin/docs/:id — rename, toggle, or reorder a document.
// The file itself isn't replaceable here — delete and re-add to swap
// the underlying file, same as every other row-based admin list in
// this app.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const body = parsed.data;

  const existing = await db.siteDocument.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const updated = await db.siteDocument.update({
    where: { id },
    data: { title: body.title, enabled: body.enabled, sortOrder: body.sortOrder },
  });

  return NextResponse.json({ row: updated });
}

// DELETE /api/admin/docs/:id — removes both the DB row and the file on
// disk. The file being missing (already deleted, disk drift) isn't
// treated as a failure — the DB row going away is what actually
// matters to the nav dropdown.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id } = await params;
  const existing = await db.siteDocument.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  await db.siteDocument.delete({ where: { id } });
  await unlink(docFilePath(existing.id, existing.fileExt)).catch(() => {});

  return NextResponse.json({ ok: true });
}
