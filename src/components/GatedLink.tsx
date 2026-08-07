"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useAuth } from "@/lib/auth-context";
import { useConnectAndSignIn } from "@/lib/useConnectAndSignIn";

// Wraps a marketing-page CTA that points at a gated /dashboard/* route
// (e.g. "Play", "Dashboard" buttons on /coin-rush, /doge-mining,
// /referral-network). dashboard/layout.tsx redirects an unauthenticated
// visitor straight back to "/" server-side — clicking one of these as a
// plain <Link> bounced the user off the marketing page they were
// reading with no explanation. Renders as a normal Link once signed in;
// otherwise renders as a button that runs the same connect+SIWE flow as
// the header's ConnectWalletButton (mirroring its two sub-states: not
// connected at all vs. wallet-connected but not yet signed in), then
// navigates to `href` itself once that session actually lands.
export function GatedLink({
  href,
  className,
  style,
  children,
}: {
  href: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const router = useRouter();
  const { isConnected } = useAccount();
  const { session, error: authError, signIn } = useAuth();
  const { connectAndSignIn, attempting, connectFailure } = useConnectAndSignIn();
  // A ref, not state — this only gates the navigation effect below, it
  // never drives a render itself, so flipping it inside that effect
  // doesn't trigger the cascading-render lint rule a setState call would.
  const awaitingSessionRef = useRef(false);

  useEffect(() => {
    if (awaitingSessionRef.current && session?.authenticated) {
      awaitingSessionRef.current = false;
      router.push(href);
    }
  }, [session, router, href]);

  if (session?.authenticated) {
    return (
      <Link href={href} className={className} style={style}>
        {children}
      </Link>
    );
  }

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => {
          awaitingSessionRef.current = true;
          if (isConnected) {
            signIn();
          } else {
            connectAndSignIn();
          }
        }}
        disabled={attempting}
        className={className}
        style={style}
      >
        {children}
      </button>
      {(connectFailure || authError) && (
        <span className="max-w-56 text-center text-[11px] text-risk">{connectFailure ?? authError}</span>
      )}
    </div>
  );
}
