-- AlterEnum
ALTER TYPE "GameMode" ADD VALUE 'KOL_REFERRAL_BONUS';

-- AlterTable
ALTER TABLE "WalletProfile" ADD COLUMN     "isKol" BOOLEAN NOT NULL DEFAULT false;
