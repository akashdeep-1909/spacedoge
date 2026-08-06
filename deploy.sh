#!/usr/bin/env bash
# One-shot deploy/update command for the app's cPanel terminal (or SSH).
# Run this from the application root after extracting the zip (first
# deploy) or after pulling/re-uploading new code (later updates).
#
#   bash deploy.sh
#
# What it does, in order:
#   1. npm install         - installs dependencies for THIS server (Linux
#                             binaries — see DEPLOY.md for why a Windows-
#                             built node_modules can't be shipped instead).
#   2. npx prisma generate - regenerates the Prisma client explicitly, run
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
#   3. npm run build        - production build (next build --webpack).
#   4. npx prisma migrate deploy - applies any new database migrations;
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
npm install
npx prisma generate --schema=./prisma/schema.prisma
npm run build
npx prisma migrate deploy
echo ""
echo "Done. Now go to cPanel -> Setup Node.js App -> Restart."
