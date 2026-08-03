import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

// GET /api/auth/session — lets the client check "am I still logged in"
// without re-deriving anything from wagmi's local connector state.
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }

  const walletProfile = await db.walletProfile.findUnique({
    where: { id: session.walletProfileId },
    select: {
      address: true,
      chainId: true,
      countryCode: true,
      ageConfirmed: true,
      termsVersion: true,
      dogeAddress: true,
      nickname: true,
    },
  });

  if (!walletProfile) {
    // Session token is valid but the profile was removed — treat as logged out.
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }

  return NextResponse.json({
    authenticated: true,
    ...walletProfile,
    requiresOnboarding:
      !walletProfile.ageConfirmed || !walletProfile.countryCode || !walletProfile.termsVersion,
  });
}
