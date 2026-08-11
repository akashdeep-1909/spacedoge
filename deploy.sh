#!/usr/bin/env bash
# One-shot deploy/update command for the app's cPanel terminal (or SSH).
# Run this from the application root after extracting the zip (first
# deploy) or after pulling/re-uploading new code (later updates).
#
#   bash deploy.sh
#
# What it does, in order:
#   1. rm -rf .next          - wipes any previous build output before
#                             rebuilding. next build does NOT reliably
#                             fully replace stale .next/server chunk
#                             files from a PRIOR build on its own —
#                             confirmed live: after several deploys in a
#                             row on this host (one of which had earlier
#                             been killed mid-build by the OOM/SIGKILL
#                             issue NODE_OPTIONS below now guards
#                             against), the site came back up after a
#                             restart with most routes throwing
#                             "TypeError: Cannot read properties of
#                             undefined (reading 'call')" from deep
#                             inside .next/server/webpack-runtime.js —
#                             a stale build's webpack module-id map no
#                             longer matching the actual chunk files
#                             physically on disk after being partially
#                             overwritten by the next build. A full
#                             clean rebuild is the standard fix; doing
#                             it every deploy is cheap insurance against
#                             this recurring silently.
#   2. npm install --include=dev - installs dependencies for THIS server
#                             (Linux binaries — see DEPLOY.md for why a
#                             Windows-built node_modules can't be shipped
#                             instead). --include=dev is required here:
#                             cPanel's Node.js app runs in Production mode,
#                             which sets NODE_ENV=production, and npm skips
#                             devDependencies whenever that's set unless
#                             told otherwise. next build itself needs several
#                             devDependencies (@tailwindcss/postcss, the
#                             typescript toolchain, etc.) since this project
#                             builds ON the server rather than shipping a
#                             pre-built bundle — confirmed live: a plain
#                             `npm install` under this app's NODE_ENV=production
#                             silently skipped @tailwindcss/postcss and
#                             failed the build with "Cannot find module
#                             '@tailwindcss/postcss'" despite it being listed
#                             in package.json.
#   3. npx prisma generate - regenerates the Prisma client explicitly, run
#                             here rather than trusting package.json's own
#                             "postinstall" hook to have done it: on hosts
#                             where node_modules is a SYMLINK into a
#                             separate Node-version directory (confirmed on
#                             cPanel's Node.js Selector — node_modules ->
#                             ~/nodevenv/<app>/<version>/lib/node_modules),
#                             npm resolves postinstall's own working
#                             directory through that symlink's real target
#                             instead of the actual project folder, so
#                             `prisma generate` fails there with "Could not
#                             find Prisma Schema" even though the schema is
#                             right where it should be. package.json's
#                             postinstall has `|| true` so that failure
#                             doesn't also abort `npm install` itself —
#                             this explicit step (run directly from this
#                             script's own, correct working directory) is
#                             the one that's actually relied on.
#   4. npm run build        - production build (next build --webpack).
#   5. npx prisma migrate deploy - applies any new database migrations;
#                                  safe to re-run, already-applied
#                                  migrations are skipped.
#
# Requires DATABASE_URL (and the app's other env vars) to already be
# set — either in a real .env file in this directory, or as
# Environment Variables in cPanel's Setup Node.js App page. See
# .env.example for the full list.
#
# After this finishes, restart the app from cPanel's Setup Node.js App
# page (Restart button) to pick up the new build.
set -e
rm -rf .next
npm install --include=dev
npx prisma generate --schema=./prisma/schema.prisma
# NODE_OPTIONS caps V8's heap explicitly rather than trusting Next's own
# memoryBasedWorkersCount (next.config.ts) to size itself correctly —
# confirmed live: that heuristic reads the HOST's total memory (`free -h`
# showed 82GB) even though this cPanel account runs under a much smaller
# LVE/cgroup memory cap, so it still picked too generous a budget and
# got silently SIGKILL'd by the host mid-build with no error message.
# 1024 is a confirmed-working value on this host, not a guess — raise it
# only after checking the account's real "Physical Memory Usage" limit
# in cPanel first.
NODE_OPTIONS="--max-old-space-size=1024" npm run build
npx prisma migrate deploy
echo ""
echo "Done. Now go to cPanel -> Setup Node.js App -> Restart."
