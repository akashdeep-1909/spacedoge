-- Admin-set hard block on withdrawal requests, with a required admin
-- remark — see WalletProfile.withdrawalRestricted's own doc-comment in
-- schema.prisma.
ALTER TABLE "WalletProfile" ADD COLUMN "withdrawalRestricted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WalletProfile" ADD COLUMN "withdrawalRestrictedNote" TEXT;
ALTER TABLE "WalletProfile" ADD COLUMN "withdrawalRestrictedAt" TIMESTAMP(3);
