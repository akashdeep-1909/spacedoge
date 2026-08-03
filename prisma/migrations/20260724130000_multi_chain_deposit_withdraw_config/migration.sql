-- AlterTable: convert chain enum column to text in place (USING cast), not drop+recreate
ALTER TABLE "DepositWatcherCursor" DROP CONSTRAINT "DepositWatcherCursor_pkey";
ALTER TABLE "DepositWatcherCursor" ALTER COLUMN "chain" TYPE TEXT USING "chain"::text;
ALTER TABLE "DepositWatcherCursor" ADD CONSTRAINT "DepositWatcherCursor_pkey" PRIMARY KEY ("chain");

ALTER TABLE "OnchainDeposit" ALTER COLUMN "chain" TYPE TEXT USING "chain"::text;

ALTER TABLE "Withdrawal" ALTER COLUMN "chain" TYPE TEXT USING "chain"::text;

-- AlterTable
ALTER TABLE "PlatformSettings" DROP COLUMN "bep20UsdtContract",
DROP COLUMN "minBep20Confirmations",
DROP COLUMN "treasuryBep20Address",
ADD COLUMN     "minDogeWithdrawal" DECIMAL(18,8);

-- DropEnum
DROP TYPE "DepositChain";

-- CreateTable
CREATE TABLE "DepositChainConfig" (
    "id" TEXT NOT NULL,
    "chainKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "treasuryAddress" TEXT NOT NULL,
    "tokenContract" TEXT NOT NULL,
    "tokenDecimals" INTEGER NOT NULL DEFAULT 18,
    "minConfirmations" INTEGER NOT NULL DEFAULT 15,
    "rpcUrl" TEXT,
    "explorerTxUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepositChainConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WithdrawChainConfig" (
    "id" TEXT NOT NULL,
    "chainKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "coinSymbol" TEXT NOT NULL DEFAULT 'USDT',
    "addressRegex" TEXT NOT NULL,
    "explorerTxUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WithdrawChainConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DepositChainConfig_chainKey_key" ON "DepositChainConfig"("chainKey");

-- CreateIndex
CREATE UNIQUE INDEX "WithdrawChainConfig_chainKey_key" ON "WithdrawChainConfig"("chainKey");
