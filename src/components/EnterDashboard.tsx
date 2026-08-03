"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

// The landing page's job ends at "authenticated" — this is what actually
// moves the user into the app once ConnectWalletButton finishes the
// connect+SIWE flow. Without it, a signed-in user is stuck staring at
// the marketing copy with no way in except typing /dashboard by hand.
export function EnterDashboard() {
  const { session } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (session?.authenticated) {
      router.push("/dashboard");
    }
  }, [session, router]);

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
