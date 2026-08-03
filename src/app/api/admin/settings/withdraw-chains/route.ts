import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";
import { getWithdrawChainConfigs } from "@/lib/settings";

// GET /api/admin/settings/withdraw-chains — every configured
// withdrawal chain, enabled or not.
export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const rows = await getWithdrawChainConfigs();
  return NextResponse.json({ rows });
}

function isValidRegex(source: string): boolean {
  try {
    new RegExp(source);
    return true;
  } catch {
    return false;
  }
}

const bodySchema = z.object({
  chainKey: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .regex(/^[A-Z0-9_]+$/, "Use uppercase letters, numbers, and underscores only (e.g. BEP20, DOGE)."),
  label: z.string().trim().min(1),
  coinSymbol: z.enum(["USDT", "DOGE"]),
  addressRegex: z.string().trim().min(1),
  explorerTxUrl: z.string().trim().nullable().optional(),
});

// POST /api/admin/settings/withdraw-chains — add a new withdrawal
// option. Every withdrawal is still completed by an admin manually
// broadcasting the real transaction (see the Withdrawal model) —
// adding a chain here never implies automated sending, it just makes
// it choosable on the withdraw page and accepted by the withdraw API.
export async function POST(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const body = parsed.data;

  if (!isValidRegex(body.addressRegex)) {
    return NextResponse.json({ error: "That address pattern isn't a valid regular expression." }, { status: 400 });
  }

  const existing = await db.withdrawChainConfig.findUnique({ where: { chainKey: body.chainKey } });
  if (existing) return NextResponse.json({ error: `A chain with key "${body.chainKey}" already exists.` }, { status: 400 });

  const created = await db.withdrawChainConfig.create({
    data: {
      chainKey: body.chainKey,
      label: body.label,
      coinSymbol: body.coinSymbol,
      addressRegex: body.addressRegex,
      explorerTxUrl: body.explorerTxUrl?.trim() || null,
    },
  });

  return NextResponse.json({ row: created });
}
