-- CreateTable
CREATE TABLE "InternalTransfer" (
    "id" TEXT NOT NULL,
    "fromWalletProfileId" TEXT NOT NULL,
    "toWalletProfileId" TEXT NOT NULL,
    "balanceType" "BalanceType" NOT NULL,
    "amount" DECIMAL(24,8) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternalTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InternalTransfer_fromWalletProfileId_idx" ON "InternalTransfer"("fromWalletProfileId");

-- CreateIndex
CREATE INDEX "InternalTransfer_toWalletProfileId_idx" ON "InternalTransfer"("toWalletProfileId");

-- AddForeignKey
ALTER TABLE "InternalTransfer" ADD CONSTRAINT "InternalTransfer_fromWalletProfileId_fkey" FOREIGN KEY ("fromWalletProfileId") REFERENCES "WalletProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalTransfer" ADD CONSTRAINT "InternalTransfer_toWalletProfileId_fkey" FOREIGN KEY ("toWalletProfileId") REFERENCES "WalletProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
