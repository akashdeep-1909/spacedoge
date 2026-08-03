-- AlterEnum
ALTER TYPE "BalanceType" ADD VALUE 'MINING_PROTECTION_RESERVE_USDT';

-- AlterTable
ALTER TABLE "MiningContract" ADD COLUMN     "cumulativeCreditedUsdtEquiv" DECIMAL(18,8) NOT NULL DEFAULT 0,
ADD COLUMN     "finalShortfallUsdt" DECIMAL(18,8),
ADD COLUMN     "reconciledAt" TIMESTAMP(3),
ADD COLUMN     "targetRoiPct" DECIMAL(6,4) NOT NULL DEFAULT 0.10;

-- CreateTable
CREATE TABLE "MiningContractAllocation" (
    "id" TEXT NOT NULL,
    "epochId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "walletProfileId" TEXT NOT NULL,
    "effectiveMp" DECIMAL(24,4) NOT NULL,
    "grossShareUsdt" DECIMAL(18,8) NOT NULL,
    "electricityShareUsdt" DECIMAL(18,8) NOT NULL,
    "poolFeeShareUsdt" DECIMAL(18,8) NOT NULL,
    "organicNetUsdt" DECIMAL(18,8) NOT NULL,
    "targetUsdt" DECIMAL(18,8) NOT NULL,
    "serviceVarianceDeductionUsdt" DECIMAL(18,8) NOT NULL,
    "reserveDrawUsdt" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "creditedUsdt" DECIMAL(18,8) NOT NULL,
    "dogeUsdtRate" DECIMAL(18,8) NOT NULL,
    "creditedDoge" DECIMAL(24,8) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiningContractAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiningEconomicsConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "fleetCapacityMhs" DECIMAL(18,4) NOT NULL DEFAULT 16000,
    "referenceMonthlyGrossUsdt" DECIMAL(18,6) NOT NULL DEFAULT 228.43,
    "minerPowerKw" DECIMAL(10,4) NOT NULL DEFAULT 3.36,
    "electricityRateUsdtPerKwh" DECIMAL(10,6) NOT NULL DEFAULT 0.04,
    "hostingElectricityRateUsdtPerKwh" DECIMAL(10,6) NOT NULL DEFAULT 0.01,
    "poolFeePct" DECIMAL(6,4) NOT NULL DEFAULT 0.02,
    "targetRoiPct" DECIMAL(6,4) NOT NULL DEFAULT 0.10,
    "dailyVarianceBandPct" DECIMAL(6,4) NOT NULL DEFAULT 0.10,
    "platformProfitAllocationPct" DECIMAL(6,4) NOT NULL DEFAULT 0.33,
    "profitabilityThresholdUsdt" DECIMAL(18,6) NOT NULL DEFAULT 218.47,
    "reserveLowBalanceThresholdUsdt" DECIMAL(18,2),
    "newContractsPaused" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByAddress" TEXT,

    CONSTRAINT "MiningEconomicsConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MiningContractAllocation_contractId_idx" ON "MiningContractAllocation"("contractId");

-- CreateIndex
CREATE INDEX "MiningContractAllocation_walletProfileId_idx" ON "MiningContractAllocation"("walletProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "MiningContractAllocation_epochId_contractId_key" ON "MiningContractAllocation"("epochId", "contractId");

-- AddForeignKey
ALTER TABLE "MiningContractAllocation" ADD CONSTRAINT "MiningContractAllocation_epochId_fkey" FOREIGN KEY ("epochId") REFERENCES "MiningEpoch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiningContractAllocation" ADD CONSTRAINT "MiningContractAllocation_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "MiningContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiningContractAllocation" ADD CONSTRAINT "MiningContractAllocation_walletProfileId_fkey" FOREIGN KEY ("walletProfileId") REFERENCES "WalletProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
