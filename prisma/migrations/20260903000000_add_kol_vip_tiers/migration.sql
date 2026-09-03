-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "kolVipEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "KolVipTier" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "minDirectReferrals" INTEGER NOT NULL,
    "minIndirectReferrals" INTEGER NOT NULL,
    "bonusPct" DECIMAL(6,4) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KolVipTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KolVipPayout" (
    "id" TEXT NOT NULL,
    "walletProfileId" TEXT NOT NULL,
    "periodMonth" TEXT NOT NULL,
    "kolVipTierId" TEXT NOT NULL,
    "qualifiedDirectCount" INTEGER NOT NULL,
    "qualifiedIndirectCount" INTEGER NOT NULL,
    "downlineProfitUsdt" DECIMAL(18,8) NOT NULL,
    "downlineHashrateMhs" DECIMAL(18,4) NOT NULL,
    "bonusUsdt" DECIMAL(18,8) NOT NULL,
    "bonusHashrateMhs" DECIMAL(18,4) NOT NULL,
    "miningContractId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KolVipPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KolVipMonthlyRun" (
    "periodMonth" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kolsEvaluated" INTEGER NOT NULL,
    "kolsRewarded" INTEGER NOT NULL,

    CONSTRAINT "KolVipMonthlyRun_pkey" PRIMARY KEY ("periodMonth")
);

-- CreateIndex
CREATE UNIQUE INDEX "KolVipTier_key_key" ON "KolVipTier"("key");

-- CreateIndex
CREATE UNIQUE INDEX "KolVipPayout_walletProfileId_periodMonth_key" ON "KolVipPayout"("walletProfileId", "periodMonth");

-- AddForeignKey
ALTER TABLE "KolVipPayout" ADD CONSTRAINT "KolVipPayout_walletProfileId_fkey" FOREIGN KEY ("walletProfileId") REFERENCES "WalletProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KolVipPayout" ADD CONSTRAINT "KolVipPayout_kolVipTierId_fkey" FOREIGN KEY ("kolVipTierId") REFERENCES "KolVipTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

