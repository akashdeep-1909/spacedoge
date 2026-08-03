-- CreateEnum
CREATE TYPE "DepositChain" AS ENUM ('BEP20', 'TRC20');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('UNMATCHED', 'PENDING', 'CREDITED');

-- CreateTable
CREATE TABLE "OnchainDeposit" (
    "id" TEXT NOT NULL,
    "chain" "DepositChain" NOT NULL,
    "txHash" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "amount" DECIMAL(24,8) NOT NULL,
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "status" "DepositStatus" NOT NULL DEFAULT 'UNMATCHED',
    "walletProfileId" TEXT,
    "creditedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnchainDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnchainDeposit_txHash_key" ON "OnchainDeposit"("txHash");

-- CreateIndex
CREATE INDEX "OnchainDeposit_walletProfileId_idx" ON "OnchainDeposit"("walletProfileId");

-- CreateIndex
CREATE INDEX "OnchainDeposit_status_idx" ON "OnchainDeposit"("status");

-- AddForeignKey
ALTER TABLE "OnchainDeposit" ADD CONSTRAINT "OnchainDeposit_walletProfileId_fkey" FOREIGN KEY ("walletProfileId") REFERENCES "WalletProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
