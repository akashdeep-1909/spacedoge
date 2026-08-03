import { getSession, type SessionPayload } from "@/lib/session";
import { db } from "@/lib/db";

// Admin access is a wallet allowlist, not a schema role — this app has
// exactly one identity system (SIWE wallet address) and no user table
// concept of "role" yet. Two sources, both lowercased addresses,
// checked server-side on every admin page and every admin API route
// (the layout gate alone would NOT protect direct API calls):
//   1. ADMIN_ADDRESSES env — the bootstrap list. Kept even after
//      AdminUser existed so the very first admin can always get in
//      (and a DB mistake/outage can never lock every admin out), and
//      so these entries can never be removed from the /admin/settings
//      UI itself (env editing is deliberately out of web reach).
//   2. AdminUser table — added/removed at runtime via /admin/settings,
//      no redeploy needed.
export function envAdminAddresses(): string[] {
  return (process.env.ADMIN_ADDRESSES ?? "")
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
}

async function dbAdminAddresses(): Promise<string[]> {
  const rows = await db.adminUser.findMany({ select: { address: true } });
  return rows.map((r) => r.address);
}

export async function isAdminAddress(address: string): Promise<boolean> {
  const lower = address.toLowerCase();
  if (envAdminAddresses().includes(lower)) return true;
  const dbAdmins = await dbAdminAddresses();
  return dbAdmins.includes(lower);
}

export async function requireAdminSession(): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session) return null;
  if (!(await isAdminAddress(session.address))) return null;
  return session;
}
