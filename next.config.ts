import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Webpack-only fallback (`next dev --webpack` / `next build --webpack`)
  // for when Turbopack itself can't run (e.g. Windows without Developer
  // Mode, which Turbopack needs for the symlinks its build cache
  // creates). @wagmi/connectors bundles connectors this app never calls
  // (see src/lib/wagmi.ts — only injected() and walletConnect() are
  // used) behind optional peer deps: porto()/tempo reach theirs via
  // `import(/* turbopackOptional: true */ '...')`, which Turbopack
  // understands and skips when missing but Webpack hard-fails on;
  // coinbaseWallet()/metaMask() reach theirs via plain static imports,
  // which Webpack resolves eagerly regardless of whether the connector
  // is ever constructed. Aliasing all four to `false` (Webpack 5's
  // "resolve to an empty module" convention) reproduces Turbopack's
  // behavior without installing wallet SDKs the app doesn't use.
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      porto: false,
      "porto/internal": false,
      accounts: false,
      "@coinbase/wallet-sdk": false,
      "@metamask/connect-evm": false,
    };
    return config;
  },
  // Turbopack auto-detects the workspace root by walking UP for the
  // nearest lockfile (package-lock.json/pnpm-lock.yaml/etc.) — an
  // unrelated, unmanaged package-lock.json sitting in the parent
  // "H5 Game" folder (predates this project, nothing to do with it)
  // was getting picked over this project's own lockfile, making
  // Turbopack serve everything relative to the WRONG directory (every
  // route 404'd, including "/", since there's no `app/` under the
  // parent folder). Pinning this explicitly is exactly what Next's own
  // "detected multiple lockfiles" warning suggests, and is the only
  // fix that doesn't require touching anything outside this project.
  turbopack: {
    root: path.join(__dirname),
  },
  // Lets the dev server accept requests proxied through an ngrok tunnel
  // (or similar) — Next.js otherwise blocks cross-origin dev requests by
  // default as a DNS-rebinding protection. Dev-only; irrelevant in
  // production (`next build`/`next start` don't use this option).
  allowedDevOrigins: [
    "*.ngrok-free.dev",
    "*.ngrok-free.app",
    "*.ngrok.app",
    "*.ngrok.io",
    // Cloudflare's free "quick tunnel" (cloudflared tunnel --url) — the
    // subdomain is randomly generated per run, so a wildcard is needed
    // the same way as the ngrok ones above. Used instead of ngrok once
    // ngrok's free-tier monthly bandwidth cap was hit mid-session (no
    // account needed, no bandwidth cap on Cloudflare's free quick tunnels).
    "*.trycloudflare.com",
    // Wildcards for the whole local network range, not one fixed IP —
    // the machine's LAN IP changes across Wi-Fi networks/DHCP renewals
    // (confirmed: it silently changed mid-session, from 192.168.100.63 to
    // 192.168.18.87, breaking the previously-hardcoded single-IP entry
    // with no obvious error). Next's allowedDevOrigins matching splits on
    // "." and matches "*" per segment (see matchWildcardDomain in
    // next/dist/server/app-render/csrf-protection.js), so these cover
    // any device on a typical home/office 192.168.x.x or 10.x.x.x
    // network without needing to update this file again.
    "192.168.*.*",
    "10.*.*.*",
  ],
};

export default nextConfig;
