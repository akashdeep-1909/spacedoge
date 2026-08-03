-- CreateTable
CREATE TABLE "ReserveSnapshot" (
    "id" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "merkleRoot" TEXT NOT NULL,
    "totalWallets" INTEGER NOT NULL,
    "totalDepositUsdt" DECIMAL(24,8) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReserveSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReserveSnapshotLeaf" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "walletProfileId" TEXT NOT NULL,
    "balanceUsdt" DECIMAL(24,8) NOT NULL,
    "nonce" TEXT NOT NULL,
    "leafHash" TEXT NOT NULL,
    "proof" JSONB NOT NULL,

    CONSTRAINT "ReserveSnapshotLeaf_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReserveSnapshot_snapshotDate_key" ON "ReserveSnapshot"("snapshotDate");

-- CreateIndex
CREATE INDEX "ReserveSnapshotLeaf_walletProfileId_idx" ON "ReserveSnapshotLeaf"("walletProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "ReserveSnapshotLeaf_snapshotId_walletProfileId_key" ON "ReserveSnapshotLeaf"("snapshotId", "walletProfileId");

-- AddForeignKey
ALTER TABLE "ReserveSnapshotLeaf" ADD CONSTRAINT "ReserveSnapshotLeaf_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ReserveSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReserveSnapshotLeaf" ADD CONSTRAINT "ReserveSnapshotLeaf_walletProfileId_fkey" FOREIGN KEY ("walletProfileId") REFERENCES "WalletProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
