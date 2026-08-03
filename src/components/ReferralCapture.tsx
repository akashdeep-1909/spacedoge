"use client";

import { useEffect } from "react";

// Doc section 13.1: the referral link encodes the referrer's wallet
// address as ?ref=. Stashed in localStorage so it survives the
// connect-wallet redirect/popup and is available when signIn() posts
// to /api/auth/verify, which only honors it for a genuinely new wallet.
export function ReferralCapture({ code }: { code?: string }) {
  useEffect(() => {
    if (code) window.localStorage.setItem("SpaceDOGE_ref", code);
  }, [code]);
  return null;
}
