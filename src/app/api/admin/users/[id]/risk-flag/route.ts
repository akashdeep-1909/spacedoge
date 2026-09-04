import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";

// A note is REQUIRED when setting riskFlag to "blocked" — mirroring
// withdrawalRestrictedNote's own precedent (see that route's
// doc-comment). A blocked wallet is refused a session entirely
// (src/app/api/auth/verify/route.ts) and, if already signed in, is
// shown a dedicated full-page block screen on every /dashboard/*
// request (src/app/dashboard/layout.tsx) showing this exact text — so
// it can never be left blank. "review" is a softer classification with
// no enforcement of its own; a note is accepted but optional there for
// consistency. Clearing back to null always clears the note/timestamp
// too rather than keeping stale history around.
// Exported so scripts/smoke-test-admin-block.ts can assert the
// note-required-when-blocking rule directly, the same way the route
// itself enforces it, without needing a real admin session cookie.
export const riskFlagBodySchema = z.union([
  z.object({ riskFlag: z.literal("blocked"), note: z.string().trim().min(1) }),
  z.object({ riskFlag: z.literal("review"), note: z.string().trim().optional() }),
  z.object({ riskFlag: z.null() }),
]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id } = await params;
  const parsed = riskFlagBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "riskFlag=\"blocked\" requires a non-empty note" }, { status: 400 });
  }

  const data =
    parsed.data.riskFlag === null
      ? { riskFlag: null, riskFlagNote: null, riskFlagSetAt: null }
      : {
          riskFlag: parsed.data.riskFlag,
          riskFlagNote: parsed.data.note?.length ? parsed.data.note : null,
          riskFlagSetAt: new Date(),
        };

  await db.walletProfile.update({ where: { id }, data });

  return NextResponse.json({ ok: true });
}
