// Shared top-nav config for every public (pre-wallet-connect) page —
// LandingContent.tsx (/) and HowItWorksContent.tsx (/how-it-works) both
// render the same header, so the link targets live in one place. Every
// href is an absolute path (with a "/#section" hash where relevant) so
// it resolves correctly regardless of which public page it's clicked
// from, not just when already on "/".
export const NAV_LINKS = [
  { href: "/how-it-works", key: "landing.navHowItWorks" as const },
  { href: "/coin-rush", key: "landing.navCoinRush" as const },
  { href: "/doge-mining", key: "landing.navDogeMining" as const },
  { href: "/#proof-of-hash", key: "landing.navProofOfHash" as const },
  { href: "/pool", key: "nav.pool" as const },
  { href: "/referral-network", key: "landing.navReferralNetwork" as const },
  { href: "/#faq", key: "landing.navFaq" as const },
] as const;
