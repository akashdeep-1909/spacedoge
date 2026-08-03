import { createConfig, http, cookieStorage, createStorage } from "wagmi";
import { sepolia, mainnet, bsc, polygon } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

// Doc section 2.1: "One approved USDT token contract on one EVM
// network at launch." Sepolia is the safe default for development —
// swap to mainnet (or the intended L2) only after the contract,
// treasury and legal review in doc section 26.1 are complete.
export const SUPPORTED_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? sepolia.id);

// Shared by every component that needs to pick a connector — desktop
// extensions and MetaMask/Trust Wallet's own in-app mobile browser both
// inject window.ethereum the same way, so this is the one signal that
// decides "use injected()" vs "use walletConnect()" everywhere in the
// app. Previously duplicated inconsistently: ConnectWalletButton.tsx
// checked this correctly, but WalletDepositButton.tsx's reconnect() just
// hardcoded connectors[0] (always injected() by array order in this
// file) regardless of whether one actually existed — silently wrong on
// a plain mobile browser tab with no injected provider at all.
export function hasInjectedProvider(): boolean {
  return typeof window !== "undefined" && Boolean((window as unknown as { ethereum?: unknown }).ethereum);
}

// Bounded-wait variant for the moment a connect attempt actually starts.
// window.ethereum isn't always present the instant a page's own scripts
// run — MetaMask's in-app browser (and some extensions) inject it
// slightly asynchronously, and a real-device debug log confirmed the
// failure mode this causes: checking hasInjectedProvider() synchronously
// at click-time can lose that race and wrongly fall back to the
// walletConnect() connector even from INSIDE MetaMask's own browser,
// where an injected provider should always win. Polls every 100ms for
// up to 1.5s (near-instant in the normal case where it's already there,
// e.g. desktop extensions — this only adds latency when the provider was
// genuinely still arriving) before giving up and reporting false.
export async function waitForInjectedProvider(timeoutMs = 1500): Promise<boolean> {
  if (hasInjectedProvider()) return true;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (hasInjectedProvider()) return true;
  }
  return false;
}

// BSC/Polygon are separate from SUPPORTED_CHAIN_ID above — that
// constant is for SIWE sign-in only. Real EVM USDT deposits happen on
// whichever chain a DepositChainConfig row points at (see
// /admin/settings), regardless of which chain the wallet used to log
// in, so every deposit-capable EVM chain needs to be registered here
// for the in-app "deposit from wallet" flow to prompt a network switch
// and send a real transfer. An admin can add a DepositChainConfig row
// for an EVM chain NOT in this list (WalletDepositButton just won't
// render for it — manual address/QR + paste-tx-hash verify still
// work, see src/app/dashboard/deposit/page.tsx).
export const DEPOSIT_CAPABLE_EVM_CHAIN_IDS = new Set<number>([bsc.id, polygon.id, mainnet.id]);

// Order matters here beyond readability: wagmi's walletConnect()
// connector picks chains[0] as the PRIMARY/preferred chain for the
// session proposal whenever connect() isn't given an explicit chainId
// (see @wagmi/connectors' walletConnect.js — targetChainId falls back
// to config.chains[0]?.id). With sepolia (a testnet) listed first, every
// wallet's connection request led with a testnet most non-developer
// wallets simply don't have enabled — MetaMask being dev-friendly
// tolerated it, but this is the most likely reason Bitget Wallet
// wouldn't connect at all, and probably added friction for Binance
// Wallet too. Mainnet first fixes that for every wallet without
// touching SUPPORTED_CHAIN_ID (still sepolia, still unused/dead outside
// this file — this is only about which chain the WC handshake prefers,
// not a "switch to mainnet for real money" change). sepolia/bsc/polygon
// stay in the list as optionalChains either way, nothing they need
// stops working.
const chains = [mainnet, sepolia, bsc, polygon] as const;

const appUrl = process.env.NEXT_PUBLIC_APP_URL;

// Injected always comes first — desktop extensions, and MetaMask/
// Trust Wallet's own in-app mobile browser, both inject window.ethereum
// the same way. WalletConnect is the fallback for a REGULAR mobile
// browser tab (Safari/Chrome) that has no injected provider at all:
// it shows a QR code (desktop) or deep-links straight into the user's
// wallet app (mobile) instead. Only added when a Project ID is
// actually configured — free signup at https://cloud.reown.com — since
// wagmi's connector throws at connect time without one, so this omits
// it entirely rather than shipping a guaranteed-broken second button.
// See src/components/ConnectWalletButton.tsx for how the app picks
// between the two automatically (no picker UI, still one button).
//
// A function, not a static config, because the project ID is now
// admin-configurable (PlatformSettings.walletConnectProjectId, see
// src/lib/settings.ts) with the env var as a fallback — resolved once
// server-side in layout.tsx and threaded down to the client Provider,
// rather than baked in at module-load time.
//
// Memoized by project ID (not rebuilt per call) — layout.tsx is a
// Server Component, so it calls this on EVERY request in the same
// long-lived Node process. walletConnect() sets up a relay client with
// its own heartbeat listeners as a side effect of construction, so
// building a fresh one per request leaked an EventEmitter listener
// every time, eventually tripping Node's MaxListenersExceededWarning
// after ~11 requests. Same project ID in ⇒ same config instance out.
const configCache = new Map<string, ReturnType<typeof buildWagmiConfig>>();

export function createWagmiConfig(walletConnectProjectId?: string) {
  const key = walletConnectProjectId ?? "";
  const cached = configCache.get(key);
  if (cached) return cached;
  const config = buildWagmiConfig(walletConnectProjectId);
  configCache.set(key, config);
  return config;
}

function buildWagmiConfig(walletConnectProjectId?: string) {
  // The WalletConnect handshake needs to tell the wallet app which
  // origin is actually asking to connect, and where to redirect back to
  // — that has to be wherever THIS session is really being served from
  // right now (a rotated ngrok subdomain, a LAN IP when testing from a
  // phone, production later), never a fixed configured URL that can
  // drift out of sync with it. NEXT_PUBLIC_APP_URL is a stable
  // production-style value used elsewhere (e.g. referral links, see
  // src/lib/publicUrl.ts) that's wrong for this specific purpose the
  // moment it doesn't match the page's real origin — confirmed as the
  // cause of "connect to MetaMask, come back, nothing happens" only
  // reproducing on the LAN IP while a matching ngrok URL worked: the
  // wallet was being told the dapp lived at the configured ngrok
  // address while the page was actually being served from the LAN IP,
  // a mismatch wallets can reasonably refuse to honor or redirect back
  // to correctly. window.location.origin is always accurate for the
  // live client-side connect flow (this function only opens a REAL
  // WalletConnect session when called from providers.tsx in the
  // browser); the env var remains the fallback for the server-only
  // initialWagmiState pass, which has no window and never opens a live
  // session anyway.
  const effectiveAppUrl = typeof window !== "undefined" ? window.location.origin : appUrl;

  if (typeof window !== "undefined" && walletConnectProjectId) {
    const looksValid = /^[a-f0-9]{16,64}$/i.test(walletConnectProjectId);
    console.log("[wallet] WalletConnect config", {
      projectIdLength: walletConnectProjectId.length,
      projectIdLooksValid: looksValid,
      configuredAppUrl: appUrl,
      effectiveAppUrl,
    });
    if (!looksValid) {
      console.warn("[wallet] WalletConnect projectId doesn't look like a real Reown/WalletConnect Cloud ID — check /admin/settings.");
    }
    if (appUrl && appUrl.replace(/\/$/, "") !== (effectiveAppUrl ?? "").replace(/\/$/, "")) {
      console.log(
        "[wallet] NEXT_PUBLIC_APP_URL differs from the page's current origin — using the current origin for WalletConnect metadata (this is expected when testing via a LAN IP or a rotated tunnel URL).",
        { configuredAppUrl: appUrl, effectiveAppUrl }
      );
    }
  }

  const connectors = [
    injected(),
    ...(walletConnectProjectId
      ? [
          walletConnect({
            projectId: walletConnectProjectId,
            showQrModal: true,
            metadata: {
              name: "Space DOGE",
              description: "Wallet-first Coin Rush Arena with verifiable Scrypt cloud-mining rewards.",
              url: effectiveAppUrl || "https://spacedoge.app",
              icons: effectiveAppUrl ? [`${effectiveAppUrl}/notification-icon.png`] : [],
              // Without this, a wallet app (MetaMask included) has no
              // universal link to send the user back to after they
              // approve a connect/sign request — it just leaves them
              // sitting in the wallet app, which is exactly the "have to
              // manually switch back to Safari" friction reported. This
              // must be a real HTTPS URL (matching `url` above) for
              // wallets to treat it as a valid return target.
              //
              // The EXACT current page URL, not just the bare origin —
              // Safari/Chrome match a universal-link return target
              // against already-open tabs to decide whether to foreground
              // the existing one or open a new one. Redirecting to just
              // "/" while the user was actually on "/dashboard/play"
              // never matches that open tab, so it opened a fresh tab on
              // every single redirect back — this is constructed
              // client-side only (see the walletConnectProjectId guard
              // above), so window is always available here.
              redirect: effectiveAppUrl ? { universal: typeof window !== "undefined" ? window.location.href : effectiveAppUrl } : undefined,
            },
          }),
        ]
      : []),
  ];

  return createConfig({
    chains,
    connectors,
    // Off so a single targetless injected() doesn't quietly turn back
    // into a multi-entry picker: wagmi's EIP-6963 auto-discovery would
    // otherwise add every announced wallet (MetaMask, Phantom, etc.) as
    // its own extra connector even though only one is configured above.
    multiInjectedProviderDiscovery: false,
    storage: createStorage({ storage: cookieStorage }),
    ssr: true,
    transports: {
      [sepolia.id]: http(),
      [mainnet.id]: http(),
      [bsc.id]: http(process.env.NEXT_PUBLIC_BSC_RPC_URL || "https://1rpc.io/bnb"),
      [polygon.id]: http(),
    },
  });
}

// Type-shape reference only — never given a real project ID. The
// connectors array's TYPE is identical either way (the ternary above
// can't be statically narrowed from a plain `string | undefined` param,
// so TypeScript already infers the union of both branches regardless of
// what's passed at runtime), so this never needs — and must never risk
// — actually constructing a live WalletConnect client just to exist as
// a type reference for WalletDepositButton.tsx's RegisteredChainId.
export const wagmiConfig = createWagmiConfig();

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
