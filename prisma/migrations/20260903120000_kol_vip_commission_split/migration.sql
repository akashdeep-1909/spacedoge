-- AlterTable
ALTER TABLE "KolVipPayout" DROP COLUMN "downlineHashrateMhs",
ADD COLUMN     "hashrateConversionUsdt" DECIMAL(18,8) NOT NULL,
ADD COLUMN     "totalCommissionUsdt" DECIMAL(18,8) NOT NULL;

