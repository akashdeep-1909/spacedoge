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
      className="mt-2 inline-block rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-110"
    >
      Enter Dashboard
    </a>
  );
}
