-- Tracks how an OnchainDeposit row was first discovered/resolved, so
-- /admin/deposits can show whether a deposit was handled by the system
-- on its own (WATCHER / AUTO_VERIFY) or needed a person to step in
-- (MANUAL_VERIFY / ADMIN_ASSIGN) — see the enum's own doc-comment in
-- schema.prisma for the full reasoning.
--
-- Defaults every pre-existing row to 'WATCHER': the background scanner
-- created the overwhelming majority of historical rows before this
-- column existed, and there's no way to retroactively know which of
-- the rest were actually verify-by-hash calls — a safe, honest-enough
-- backfill rather than leaving old rows NULL.
-- CreateEnum
CREATE TYPE "DepositSource" AS ENUM ('WATCHER', 'AUTO_VERIFY', 'MANUAL_VERIFY', 'ADMIN_ASSIGN');

-- AlterTable
ALTER TABLE "OnchainDeposit" ADD COLUMN "source" "DepositSource" NOT NULL DEFAULT 'WATCHER';
