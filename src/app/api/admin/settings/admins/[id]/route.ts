import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";

// DELETE /api/admin/settings/admins/:id — revokes a DB-managed admin.
// Env-sourced admins have no :id (see the GET route) so they can never
// hit this route — env stays .env-only by design. Self-removal is
// blocked so an admin can't lock themselves out of their own session
// with no one else around to re-add them.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id } = await params;
  const target = await db.adminUser.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Admin not found" }, { status: 404 });

  if (target.address === session.address.toLowerCase()) {
    return NextResponse.json({ error: "You can't remove your own admin access." }, { status: 400 });
  }

  await db.adminUser.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
