import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  source: z.string().trim().max(64).optional(),
});

// POST /api/waitlist — public, no wallet/session required. Backs the
// "Join Waitlist" popup (src/components/WaitlistModal.tsx) reachable
// from the marketing pages. A repeat submission from the same email
// (WaitlistEntry.email is @unique) is treated as a success, not an
// error — the visitor already got what they wanted (being on the
// list), so there's nothing useful to tell them went wrong.
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const { email, source } = parsed.data;

  try {
    await db.waitlistEntry.create({ data: { email, source } });
  } catch (err: unknown) {
    const code = (err as { code?: string } | null)?.code;
    if (code !== "P2002") throw err;
  }

  return NextResponse.json({ ok: true });
}
