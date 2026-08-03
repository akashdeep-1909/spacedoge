import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

const CURRENT_TERMS_VERSION = "2026-07-16-v4"; // bump when Game Rules / Mining Terms change

const bodySchema = z.object({
  countryCode: z.string().length(2), // ISO 3166-1 alpha-2
  ageConfirmed: z.literal(true),
});

// POST /api/auth/onboard
// Doc section 3.1 step 6: age declaration, country declaration and
// terms acceptance, required before paid play. This is NOT a KYC
// document check — see doc section 20.2, "no routine upfront KYC".
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // TODO(compliance): reject/geofence unsupported countryCode values here
  // once the target-market list is legally approved (doc section 20.3).
  await db.walletProfile.update({
    where: { id: session.walletProfileId },
    data: {
      countryCode: parsed.data.countryCode.toUpperCase(),
      ageConfirmed: parsed.data.ageConfirmed,
      termsVersion: CURRENT_TERMS_VERSION,
    },
  });

  return NextResponse.json({ ok: true, termsVersion: CURRENT_TERMS_VERSION });
}
