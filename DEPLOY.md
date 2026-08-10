# Deploying Space DOGE to cPanel / LiteSpeed

This app is built to run on cPanel's **"Setup Node.js App"** tool
(Phusion Passenger), using `server.js` as its startup file. That file's
own doc-comment explains why it exists: Passenger doesn't run
`npm run start` — it requires() a plain Node.js file that opens an HTTP
server on `process.env.PORT` itself.

## What's in this zip

Source and config only — no `node_modules`, no `.next` build output.
Both were deliberately left out: this project was built on Windows,
and Next.js's compiler (`@next/swc-*`) ships **platform-specific**
native binaries. A `node_modules` installed on Windows will not run on
your Linux cPanel server — it has to be installed fresh, on the
server, so npm pulls the correct Linux binaries. Everything below
walks through that — `deploy.sh` (step 4) collapses it down to one
command.

## 1. Prerequisites on the server

- **Node.js 20+** available via cPanel's "Setup Node.js App" (check
  which versions your host offers before creating the app).
- **A PostgreSQL database** — via cPanel's "PostgreSQL Databases" tool,
  or an external managed Postgres (Neon, Supabase, RDS, etc.), as long
  as it's reachable from the server.

## 2. Upload and extract

1. Upload this zip via cPanel File Manager (or SFTP) to the directory
   you'll point the Node.js app at (e.g. `~/spacedoge` — **not**
   `public_html` directly; Passenger serves the app itself, it doesn't
   need to sit in the web root).
2. Extract it there.

## 3. Create the Node.js app

In cPanel → **Setup Node.js App** → Create Application:

- **Node.js version**: 20 or newer.
- **Application mode**: Production.
- **Application root**: the folder you extracted into (e.g. `spacedoge`).
- **Application URL**: your domain (e.g. `spacedoge.games`).
- **Application startup file**: `server.js`.

Save. cPanel will give you a command like `source
/home/.../nodevenv/spacedoge/20/bin/activate && cd
/home/.../spacedoge` — you'll use that to run commands in the app's own
Node environment via SSH (see step 4). If you don't have SSH access,
cPanel's Node.js App page also has a terminal icon that gives you the
same environment through the browser.

## 4. Install dependencies and build

**One command does all three steps** — from the app's terminal (SSH,
or cPanel's built-in browser terminal for that Node app):

```bash
bash deploy.sh
```

This runs, in order: `npm install` (pulls Linux-correct binaries for
this server, including Next's compiler — and automatically also runs
`prisma generate` via the `postinstall` script in `package.json`, so
that step needs no separate command), then `npm run build` (production
build), then `npx prisma migrate deploy` (see step 6 — safe to run
every time, already-applied migrations are just skipped).

If your host's cPanel plan gives you a **"Run NPM Install" button**
instead of real terminal access, that button alone *does* cover step 1
(dependencies + Prisma client generation, via the same `postinstall`
hook) — but `next build` and the database migration still need an
actual command to run somewhere, which is what `deploy.sh` is for.
There's no way to fully skip a terminal for this app: it's a genuine
Next.js production build, not a static site, and cPanel's Node.js UI
doesn't have a "build" or "run arbitrary command" button on its own.
This is the smallest that command surface gets — one line, once per
deploy.

If you'd rather run the three steps individually (e.g. to see each
one's output separately):

```bash
npm install --include=dev
NODE_OPTIONS="--max-old-space-size=1024" npm run build
npx prisma migrate deploy
```

`--include=dev` matters here: cPanel's Node.js app runs with
`NODE_ENV=production` set, which makes npm skip `devDependencies` by
default — but `next build` needs several of them (`@tailwindcss/postcss`,
the TypeScript toolchain, etc.) since this project builds on the server
rather than shipping a pre-built bundle. Without this flag, `npm install`
succeeds but a later `next build` fails with `Cannot find module
'@tailwindcss/postcss'` even though it's right there in package.json.

`NODE_OPTIONS="--max-old-space-size=1024"` matters too — confirmed live:
without it, `next build` gets silently `SIGKILL`'d partway through
"Creating an optimized production build" with no error message. This
project's `next.config.ts` already tunes `memoryBasedWorkersCount` /
`webpackBuildWorker` for low-memory builds, but that heuristic reads the
HOST's total memory (`free -h` can show 80+ GB on shared hosting) rather
than this specific cPanel account's actual, much smaller LVE/cgroup
memory cap — so it still budgets too generously. Capping V8's heap
directly sidesteps that. 1024 is a confirmed-working value on this
host, not a generic default — if you're setting this up on a different
host, check that account's actual "Physical Memory Usage" limit in
cPanel first rather than assuming 1024 fits.

## 5. Configure environment variables

Copy `.env.example` to `.env` and fill in real production values, **or**
set the same variable names directly in cPanel's Node.js App page under
"Environment Variables" (either works — the panel's own values take
priority if both are set). At minimum, before going live:

- `DATABASE_URL` — your production Postgres connection string.
- `SESSION_SECRET` — a real random value, **not** the dev placeholder.
  Generate one with:
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `DEPOSIT_CRON_SECRET` — another real random value (see step 7).
- `NEXT_PUBLIC_APP_URL` — your real domain, no trailing slash.
- `ADMIN_ADDRESSES` — at least one lowercased wallet address, or nobody
  can reach `/admin`.
- `TREASURY_BEP20_ADDRESS` — your real BSC receiving address, if BEP20
  USDT deposits are live.
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
  — generate a real production pair with `npx web-push generate-vapid-keys`.
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — free from
  https://cloud.reown.com. Without it, mobile browsers (not a wallet
  app's own in-app browser) can't connect a wallet at all.

Every variable, with its full explanation, is documented inline in
`.env.example`.

## 6. Database migrations

Already handled by `deploy.sh` in step 4 (`npx prisma migrate deploy`
applies every migration under `prisma/migrations/` against
`DATABASE_URL` — safe to re-run, already-applied migrations are
skipped). Only relevant here if you're running the three steps
individually instead.

## 7. Set up the deposit-watching cron job

Real BEP20 USDT deposits are only picked up when
`/api/wallet/deposit-watch` is hit — nothing runs this on a timer by
itself. In cPanel → **Cron Jobs**, add one that runs every 1–5 minutes:

```bash
curl -s -H "Authorization: Bearer YOUR_DEPOSIT_CRON_SECRET" https://yourdomain.com/api/wallet/deposit-watch
```

Use the same value you set for `DEPOSIT_CRON_SECRET` in step 5. Every
other background-style task in this app (mining settlement, reserve
snapshots, weekly leaderboard payout) is lazy-triggered on the next
real page/API request instead of needing its own cron job — this is
the one exception.

## 8. Start the app

Back in cPanel → Setup Node.js App, click **Restart** (or Start, if
this is the first run) for the application. Visit your domain and
confirm it loads.

## 9. After any future code update

```bash
git pull   # or re-upload/extract a fresh zip
bash deploy.sh
```

Then Restart the app from the cPanel Node.js App page.

## Notes

- `next.config.ts` aliases a few optional wallet-connector packages
  (`porto`, Coinbase Wallet SDK, MetaMask connect) to `false` — this
  app only ever uses the `injected()` and `walletConnect()` connectors
  (see `src/lib/wagmi.ts`), so those packages are never installed and
  don't need to be.
- The `⚠ Critical dependency: the request of a dependency is an
  expression` warning during `npm run build` (from
  `viem/.../tempo/...`) is expected and harmless — it's a known quirk
  in one of viem's chain definitions, unrelated to anything in this app.
- If `npm install` fails with `Error: Could not find Prisma Schema...`
  even though `prisma/schema.prisma` genuinely exists — confirmed on
  cPanel's Node.js Selector, where `node_modules` is a symlink into a
  separate `~/nodevenv/<app>/<version>/lib/node_modules` directory —
  that's `package.json`'s own `postinstall` hook resolving its working
  directory through that symlink's real target instead of the actual
  project folder. Harmless: `postinstall` has `|| true` so it can't
  abort `npm install` itself, and `deploy.sh` runs its own explicit
  `npx prisma generate --schema=./prisma/schema.prisma` right after,
  from the correct directory, which is the step actually relied on.
