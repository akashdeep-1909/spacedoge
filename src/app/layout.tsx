import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers, cookies } from "next/headers";
import { cookieToInitialState } from "wagmi";
import { createWagmiConfig } from "@/lib/wagmi";
import { getWalletConnectProjectId } from "@/lib/settings";
import { Providers } from "./providers";
import { WalletDebugOverlay } from "@/components/WalletDebugOverlay";
import { LOCALES, DEFAULT_LOCALE, LOCALE_COOKIE, type Locale } from "@/lib/i18n/locales";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Explicit even though Next.js already sets a sensible default
// (width=device-width, initial-scale=1) — that default still allows
// PINCH-ZOOM, which is what actually produced the squished-tiny-content-
// in-a-sea-of-black-margin layout reported live from MetaMask's own
// in-app browser: its chrome doesn't reset a user's pinch-zoom level
// between page loads/navigations within the same browser tab, so a
// zoom applied once (even by accident) silently persists onto every
// later page. maximumScale/userScalable pin the page at 1:1 and disable
// pinching entirely, so that zoomed-out state can't happen in the first
// place — standard practice for a wallet-first dapp where the whole UI
// is already designed to be legible at native scale.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  // Without this, Next.js can't resolve the relative openGraph/twitter
  // image paths below into absolute URLs and silently falls back to
  // "http://localhost:3000" — confirmed shipping to production as the
  // literal og:image URL. NEXT_PUBLIC_APP_URL is already the app's one
  // source of truth for its own public origin (see src/lib/publicUrl.ts).
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://spacedoge.games"),
  title: "Space DOGE - Play the Rush. Power the Hash. Claim DOGE.",
  description:
    "Wallet-first Coin Rush Arena with verifiable Scrypt cloud-mining rewards.",
  // Without this, iOS Safari auto-detects plain numeric stat values
  // (hashrate, DOGE amounts, etc.) that happen to look phone-number-ish
  // and rewrites them into `<a href="tel:...">` links AFTER the page
  // loads — the server never rendered a link there, so React sees a
  // real DOM mismatch and throws a hydration error (confirmed via a
  // real-device screenshot: "204.8110" got turned into
  // `<a href="tel:204.8110">`). This meta tag is Safari's own opt-out.
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: "Space DOGE - Play the Rush. Power the Hash. Claim DOGE.",
    description:
      "Wallet-first Coin Rush Arena with verifiable Scrypt cloud-mining rewards.",
    images: ["/SpaceDOGE-logo.png"],
  },
  twitter: {
    card: "summary",
    title: "Space DOGE",
    description:
      "Wallet-first Coin Rush Arena with verifiable Scrypt cloud-mining rewards.",
    images: ["/SpaceDOGE-logo.png"],
  },
  // iOS Safari has no install prompt of its own — this only controls
  // what the result looks like ONCE a user manually does Share -> Add
  // to Home Screen (see src/app/install-ios/page.tsx), not whether
  // they're offered to. `capable: true` is what actually drops the
  // Safari chrome for a standalone/full-screen launch; without it the
  // home-screen icon still opens inside a normal Safari tab.
  appleWebApp: {
    capable: true,
    title: "Space DOGE",
    statusBarStyle: "black-translucent",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolved once here (DB override, env fallback — see
  // getWalletConnectProjectId) so an admin change in /admin/settings
  // takes effect on the very next request, no redeploy or dev-server
  // restart needed — but NEVER passed into the server's own
  // cookieToInitialState config below. WalletConnect's connector opens
  // a real relay WebSocket + heartbeat as a side effect of being
  // constructed, and cookieToInitialState (wagmi's own cookie.ts) only
  // ever reads config.storage.key — it never touches config.connectors
  // at all. Building a real WalletConnect client on the SERVER for this
  // was not just the MaxListenersExceededWarning source, it also let a
  // server-side relay client and the browser's own client race over the
  // same session state, producing intermittent "session topic doesn't
  // exist" errors client-side. The real connector is only ever
  // constructed client-side, in providers.tsx, using the projectId
  // passed down as a prop below.
  const walletConnectProjectId = await getWalletConnectProjectId();
  const serverWagmiConfig = createWagmiConfig();
  const initialWagmiState = cookieToInitialState(serverWagmiConfig, (await headers()).get("cookie"));

  const localeCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const initialLocale: Locale = (LOCALES as readonly string[]).includes(localeCookie ?? "")
    ? (localeCookie as Locale)
    : DEFAULT_LOCALE;

  return (
    <html
      lang={initialLocale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* suppressHydrationWarning here only silences attribute-mismatch
          warnings ON THIS ELEMENT — it does not hide real mismatches
          anywhere else in the tree. Needed because extensions like
          Grammarly/LastPass inject attributes (data-gr-ext-installed,
          data-new-gr-c-s-check-loaded, etc.) onto <body> before React
          hydrates, which otherwise falsely reports as a hydration
          error even though the app's own render output is identical. */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <Providers
          initialWagmiState={initialWagmiState}
          initialLocale={initialLocale}
          walletConnectProjectId={walletConnectProjectId}
        >
          {children}
        </Providers>
        <WalletDebugOverlay />
      </body>
    </html>
  );
}
