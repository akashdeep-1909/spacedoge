import { db } from "@/lib/db";

// Fresh, DB-backed read of a wallet's CURRENT block status — deliberately
// separate from getSession() (src/lib/session.ts), which only verifies
// the signed JWT cookie and never touches the DB. Adding a block check
// there would silently add a DB round-trip to every single authenticated
// request across the whole app; this is called from exactly the two
// places that need it instead: the sign-in verify route (refuses to
// issue a session to an already-blocked wallet) and the dashboard layout
// (re-checked on every request/navigation, which is what makes "blocked
// after a page refresh" actually take effect — a JWT alone has no way to
// reflect a block that happened AFTER it was issued).
export interface BlockStatus {
  blocked: boolean;
  note: string | null;
}

export async function getWalletBlockStatus(walletProfileId: string): Promise<BlockStatus> {
  const profile = await db.walletProfile.findUnique({
    where: { id: walletProfileId },
    select: { riskFlag: true, riskFlagNote: true },
  });
  return {
    blocked: profile?.riskFlag === "blocked",
    note: profile?.riskFlag === "blocked" ? profile.riskFlagNote : null,
  };
}
