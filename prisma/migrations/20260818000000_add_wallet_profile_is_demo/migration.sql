-- Admin-only "this wallet is a demo/marketing account" flag — see
-- WalletProfile.isDemo's own doc-comment in schema.prisma.
ALTER TABLE "WalletProfile" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;
