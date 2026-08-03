import { generateNonce } from "siwe";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/auth/nonce?address=0x...
// Issues a single-use nonce the client embeds in the SIWE message it
// asks the wallet to sign. Doc section 3.1, step 3.
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");
  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  const nonce = generateNonce();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes to complete the signature

  await db.authNonce.create({
    data: { address: address.toLowerCase(), nonce, expiresAt },
  });

  return NextResponse.json({ nonce });
}
