-- CreateTable
CREATE TABLE "DepositTreasuryAddress" (
    "id" TEXT NOT NULL,
    "chainConfigId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepositTreasuryAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepositAddressAssignment" (
    "id" TEXT NOT NULL,
    "walletProfileId" TEXT NOT NULL,
    "chainConfigId" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepositAddressAssignment_pkey" PRIMARY KEY ("id")
);

-- Backfill: every existing DepositChainConfig row already has exactly
-- one real treasuryAddress in production use — becomes the first pool
-- entry for that chain, so nothing that currently works stops working
-- (the very next user to load the deposit page for that chain simply
-- gets assigned this same address, first-come-first-served like every
-- assignment after it).
--
-- gen_random_uuid() requires either Postgres 13+ (built in) or the
-- pgcrypto extension on older versions — neither guaranteed on every
-- deploy target (hit a Postgres 10 host with no pgcrypto installed at
-- the OS level, not just un-enabled). This id only needs to be unique,
-- never cryptographically unpredictable, so an md5-of-random+clock-time
-- hash cast to uuid is a core-Postgres-only equivalent that's worked
-- back to ancient versions, no extension required.
INSERT INTO "DepositTreasuryAddress" ("id", "chainConfigId", "address", "enabled", "sortOrder", "createdAt")
SELECT md5(random()::text || clock_timestamp()::text)::uuid::text, "id", "treasuryAddress", true, 0, now()
FROM "DepositChainConfig";

-- AlterTable
ALTER TABLE "DepositChainConfig" DROP COLUMN "treasuryAddress";

-- CreateIndex
CREATE UNIQUE INDEX "DepositTreasuryAddress_chainConfigId_address_key" ON "DepositTreasuryAddress"("chainConfigId", "address");

-- CreateIndex
CREATE UNIQUE INDEX "DepositAddressAssignment_addressId_key" ON "DepositAddressAssignment"("addressId");

-- CreateIndex
CREATE UNIQUE INDEX "DepositAddressAssignment_walletProfileId_chainConfigId_key" ON "DepositAddressAssignment"("walletProfileId", "chainConfigId");

-- AddForeignKey
ALTER TABLE "DepositTreasuryAddress" ADD CONSTRAINT "DepositTreasuryAddress_chainConfigId_fkey" FOREIGN KEY ("chainConfigId") REFERENCES "DepositChainConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositAddressAssignment" ADD CONSTRAINT "DepositAddressAssignment_walletProfileId_fkey" FOREIGN KEY ("walletProfileId") REFERENCES "WalletProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositAddressAssignment" ADD CONSTRAINT "DepositAddressAssignment_chainConfigId_fkey" FOREIGN KEY ("chainConfigId") REFERENCES "DepositChainConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositAddressAssignment" ADD CONSTRAINT "DepositAddressAssignment_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "DepositTreasuryAddress"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
