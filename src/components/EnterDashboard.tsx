"use client";

import { useAuth } from "@/lib/auth-context";

// Shown once signed in, right alongside the header's own connected
// state (address pill + Disconnect) — landing on "/" (e.g. clicking the
// logo) while connected should show the homepage as normal with a way
// in, not silently bounce straight to /dashboard before the user ever
// sees the page. Only navigates on an actual click.
export function EnterDashboard() {
  const { session } = useAuth();

  if (!session?.authenticated) return null;

  return (
    <a
      href="/dashboard"
      className="btn-game hud-corner text-sm font-bold uppercase tracking-wide"
    >
      Enter Dashboard
    </a>
  );
}
