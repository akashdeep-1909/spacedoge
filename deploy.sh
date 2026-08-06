#!/usr/bin/env bash
# One-shot deploy/update command for the app's cPanel terminal (or SSH).
# Run this from the application root after extracting the zip (first
# deploy) or after pulling/re-uploading new code (later updates).
#
#   bash deploy.sh
#
# What it does, in order:
#   1. npm install       - installs dependencies for THIS server (Linux
#                           binaries — see DEPLOY.md for why a Windows-
#                           built node_modules can't be shipped instead).
#                           Also runs the "postinstall" script
#                           (`prisma generate`) automatically.
#   2. npm run build      - production build (next build --webpack).
#   3. npx prisma migrate deploy - applies any new database migrations;
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
npm run build
npx prisma migrate deploy
echo ""
echo "Done. Now go to cPanel -> Setup Node.js App -> Restart."
