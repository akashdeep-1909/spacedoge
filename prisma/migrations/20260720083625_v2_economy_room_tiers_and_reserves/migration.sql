-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "GameMode" ADD VALUE 'EXPLORER_RUSH';
ALTER TYPE "GameMode" ADD VALUE 'ELITE_RUSH';
ALTER TYPE "GameMode" ADD VALUE 'CHAMPION_RUSH';

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "miningReserveUsdt" DECIMAL(18,6) NOT NULL DEFAULT 0,
ADD COLUMN     "referralReserveUsdt" DECIMAL(18,6) NOT NULL DEFAULT 0;
