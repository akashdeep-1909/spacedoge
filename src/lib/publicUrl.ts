// Falls back to the browser's own origin when NEXT_PUBLIC_APP_URL isn't
// set — lets someone testing through a tunnel (ngrok etc.) keep
// browsing the host UI via localhost while still generating shareable
// links (lobby invite links, referral links) that point at the public
// tunnel URL a friend can actually reach. NEVER use this for SIWE's own
// `uri` field (src/lib/auth-context.tsx) — that must always match
// wherever the signing actually happened, not an overridden value.
export function getPublicOrigin(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (env) return env;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}
