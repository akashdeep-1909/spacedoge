-- CreateEnum
CREATE TYPE "KolVipPayoutStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "KolVipPayout" DROP COLUMN "downlineProfitUsdt",
ADD COLUMN     "downlineRevenueUsdt" DECIMAL(18,8) NOT NULL,
ADD COLUMN     "rejectedReason" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedByAddress" TEXT,
ADD COLUMN     "status" "KolVipPayoutStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "vipFundingBaseUsdt" DECIMAL(18,8) NOT NULL;

