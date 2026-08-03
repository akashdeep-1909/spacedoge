import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

// Short-lived signed session, created only after a verified SIWE
// signature (see /api/auth/verify). No username/password anywhere.
// Doc section 3.1: "session expires automatically and must be
// refreshed through a new signature."
const SESSION_COOKIE = "SpaceDOGE_session";
const SESSION_TTL_SECONDS = 60 * 60 * 2; // 2 hours

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET is missing or too short. Set a strong value in .env before running auth flows."
    );
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  address: string; // lowercased EVM address — primary identity, see doc section 3.2
  chainId: number;
  walletProfileId: string;
}

export async function createSessionCookie(payload: SessionPayload) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (
      typeof payload.address === "string" &&
      typeof payload.chainId === "number" &&
      typeof payload.walletProfileId === "string"
    ) {
      return {
        address: payload.address,
        chainId: payload.chainId,
        walletProfileId: payload.walletProfileId,
      };
    }
    return null;
  } catch {
    // expired or tampered — treat as logged out, never throw into a page render
    return null;
  }
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
