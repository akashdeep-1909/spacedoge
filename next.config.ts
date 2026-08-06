import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Production build was getting SIGKILL'd by the OS's out-of-memory
  // killer partway through "Creating an optimized production build"
  // on cPanel shared hosting (confirmed live: `npm run build` -> "863070
  // Killed", no other error) — this app has 87+ routes, and Next.js's
  // default worker count is based on the HOST's reported CPU count,
  // which on shared hosting commonly overstates what the account's
  // actual memory allocation can support (many CPUs visible, a small
  // memory cgroup limit). memoryBasedWorkersCount switches worker-count
  // selection to available memory instead of CPU count (this is exactly
  // the scenario it exists for); cpus is a hard ceiling on top of that;
  // webpackBuildWorker/webpackMemoryOptimizations are Next's own
  // documented lower-peak-memory build options (see
  // node_modules/next/dist/docs/01-app/02-guides/memory-usage.md).
  experimental: {
    cpus: 1,
    memoryBasedWorkersCount: true,
    webpackBuildWorker: true,
    webpackMemoryOptimizations: true,
    // Source map generation is a real, direct memory cost during the
    // exact "Creating an optimized production build" phase that was
    // getting OOM-killed — turning it off removes that cost outright
    // rather than just hoping worker-count tuning alone is enough.
    serverSourceMaps: false,
  },
  productionBrowserSourceMaps: false,
  // The build's own separate "Running TypeScript" pass is skipped here
  // — not skipped blindly: `npx tsc --noEmit` is run locally (and
  // should be run in CI) before every deploy, so type errors are
  // already caught before this config is even reached. Re-running the
  // full project's type-checking a second time, in-process, during an
  // already memory-constrained build is one more multi-hundred-MB
  // phase this account's memory limit doesn't have room for.
  typescript: {
    ignoreBuildErrors: true,
  },
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
  webpack: (config, { dev }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      porto: false,
      "porto/internal": false,
      accounts: false,
      "@coinbase/wallet-sdk": false,
      "@metamask/connect-evm": false,
    };
    // Webpack's persistent build cache trades memory (and disk) for
    // faster REPEAT builds — no benefit on a CI-style deploy that
    // builds once and throws the checkout away, only cost. Production
    // only; dev keeps the cache (fast rebuilds while iterating still
    // matter there).
    if (!dev && config.cache) {
      config.cache = Object.freeze({ type: "memory" });
    }
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
