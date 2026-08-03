import { NextRequest, NextResponse } from "next/server";
import { SiweMessage } from "siwe";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSessionCookie } from "@/lib/session";
import { applyReferralCode } from "@/lib/referrals";

const bodySchema = z.object({
  message: z.string().min(1),
  signature: z.string().min(1),
  referralCode: z.string().optional(),
});

// POST /api/auth/verify
// Verifies the signed SIWE message against the nonce we issued, then
// creates (or reuses) the wallet profile and issues a session cookie.
// No password, no email — the signature IS the login. Doc section 3.1.
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { message, signature, referralCode } = parsed.data;

  let siweMessage: SiweMessage;
  try {
    siweMessage = new SiweMessage(message);
  } catch {
    return NextResponse.json({ error: "Malformed SIWE message" }, { status: 400 });
  }

  const address = siweMessage.address.toLowerCase();

  // The nonce must be one we actually issued for this address, unused, unexpired.
  const nonceRecord = await db.authNonce.findFirst({
    where: { nonce: siweMessage.nonce, address, used: false, expiresAt: { gt: new Date() } },
  });
  if (!nonceRecord) {
    return NextResponse.json({ error: "Nonce is invalid, used, or expired" }, { status: 401 });
  }

  // Domain binding — reject signatures crafted for a different host
  // (phishing / replay protection). See doc appendix C.
  const requestHost = request.headers.get("host") ?? "";

  let verification;
  try {
    verification = await siweMessage.verify({
      signature,
      domain: requestHost,
      nonce: siweMessage.nonce,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Signature verification failed", detail: `${err}` },
      { status: 401 }
    );
  }

  if (!verification.success) {
    return NextResponse.json(
      { error: verification.error?.type ?? "Signature verification failed" },
      { status: 401 }
    );
  }

  // Nonce is now spent — never valid for a second verify call.
  await db.authNonce.update({ where: { id: nonceRecord.id }, data: { used: true } });

  // Checked before the upsert so referral attribution only ever applies
  // to a wallet's genuine first connect (doc section 13.1), never a
  // returning wallet replaying a ?ref= link.
  const preexisting = await db.walletProfile.findUnique({ where: { address } });

  const walletProfile = await db.walletProfile.upsert({
    where: { address },
    update: { chainId: siweMessage.chainId },
    create: { address, chainId: siweMessage.chainId },
  });

  if (!preexisting && referralCode) {
    await applyReferralCode(walletProfile.id, referralCode);
  }

  await createSessionCookie({
    address,
    chainId: siweMessage.chainId,
    walletProfileId: walletProfile.id,
  });

  return NextResponse.json({
    address: walletProfile.address,
    chainId: walletProfile.chainId,
    // Signals whether onboarding (age/country/terms) still needs to happen —
    // doc section 3.1, step 6.
    requiresOnboarding:
      !walletProfile.ageConfirmed || !walletProfile.countryCode || !walletProfile.termsVersion,
  });
}
