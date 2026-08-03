import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession, envAdminAddresses } from "@/lib/admin";
import { db } from "@/lib/db";

// GET /api/admin/settings/admins — the full effective admin list: env
// bootstrap entries (read-only here, edited only via .env directly)
// merged with DB-managed entries (added/removed from this UI).
export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const dbAdmins = await db.adminUser.findMany({ orderBy: { createdAt: "asc" } });

  const envRows = envAdminAddresses().map((address) => ({
    id: null,
    address,
    source: "env" as const,
    createdAt: null,
    addedByAddress: null,
  }));
  const dbRows = dbAdmins.map((a) => ({
    id: a.id,
    address: a.address,
    source: "db" as const,
    createdAt: a.createdAt,
    addedByAddress: a.addedByAddress,
  }));

  return NextResponse.json({ rows: [...envRows, ...dbRows], you: session.address.toLowerCase() });
}

const bodySchema = z.object({ address: z.string().min(1) });

// POST /api/admin/settings/admins — grant admin access to a wallet
// address. Only affects the DB-managed list; env entries stay
// .env-only by design (see src/lib/admin.ts).
export async function POST(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const address = parsed.data.address.trim().toLowerCase();
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "That doesn't look like a valid wallet address." }, { status: 400 });
  }

  if (envAdminAddresses().includes(address)) {
    return NextResponse.json({ error: "That address is already an admin via ADMIN_ADDRESSES." }, { status: 400 });
  }

  const existing = await db.adminUser.findUnique({ where: { address } });
  if (existing) return NextResponse.json({ error: "That address is already an admin." }, { status: 400 });

  const created = await db.adminUser.create({
    data: { address, addedByAddress: session.address.toLowerCase() },
  });

  return NextResponse.json({ id: created.id, address: created.address, createdAt: created.createdAt });
}
