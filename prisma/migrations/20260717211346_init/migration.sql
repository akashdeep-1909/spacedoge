-- CreateEnum
CREATE TYPE "BalanceType" AS ENUM ('PLAY_USDT', 'GAME_REWARD_USDT', 'PENDING_DOGE', 'AVAILABLE_DOGE', 'RECYCLED_USDT');

-- CreateEnum
CREATE TYPE "GameMode" AS ENUM ('PRACTICE', 'QUICK_RUSH', 'PRO_RUSH', 'SPONSORED_DROP', 'FORGE_CUP');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('RESERVED', 'IN_MATCH', 'PROVISIONAL', 'SETTLED_WIN', 'SETTLED_LOSS', 'CANCELLED', 'UNDER_REVIEW', 'REVERSED');

-- CreateEnum
CREATE TYPE "MiningLevel" AS ENUM ('STARTER', 'SCOUT', 'ROVER', 'LUNAR', 'DEEP_CORE', 'ORBITAL');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'QUALIFIED', 'REWARDED', 'REJECTED');

-- CreateTable
CREATE TABLE "WalletProfile" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "countryCode" TEXT,
    "ageConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "termsVersion" TEXT,
    "dogeAddress" TEXT,
    "dogeAddressBoundAt" TIMESTAMP(3),
    "riskFlag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthNonce" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthNonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "walletProfileId" TEXT NOT NULL,
    "balanceType" "BalanceType" NOT NULL,
    "amount" DECIMAL(24,8) NOT NULL,
    "reason" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "mode" "GameMode" NOT NULL,
    "entryFeeUsdt" DECIMAL(18,6) NOT NULL,
    "prizePoolUsdt" DECIMAL(18,6) NOT NULL,
    "platformFeeUsdt" DECIMAL(18,6) NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'RESERVED',
    "mapSeed" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchParticipant" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "walletProfileId" TEXT NOT NULL,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "score" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "rewardUsdt" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "eventLogHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiningContract" (
    "id" TEXT NOT NULL,
    "walletProfileId" TEXT NOT NULL,
    "level" "MiningLevel" NOT NULL,
    "miningPower" INTEGER NOT NULL,
    "termDays" INTEGER NOT NULL,
    "pricePaidUsdt" DECIMAL(18,6) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiningContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiningEpoch" (
    "id" TEXT NOT NULL,
    "epochDate" TIMESTAMP(3) NOT NULL,
    "contractedHashrate" DECIMAL(18,4) NOT NULL,
    "observedHashrate" DECIMAL(18,4) NOT NULL,
    "grossOutputDoge" DECIMAL(24,8) NOT NULL,
    "poolProviderFeesDoge" DECIMAL(24,8) NOT NULL,
    "maintenanceCostDoge" DECIMAL(24,8) NOT NULL,
    "reserveContributionDoge" DECIMAL(24,8) NOT NULL,
    "netDistributableDoge" DECIMAL(24,8) NOT NULL,
    "totalEffectiveMp" DECIMAL(24,4) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "isSimulated" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiningEpoch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiningAllocation" (
    "id" TEXT NOT NULL,
    "epochId" TEXT NOT NULL,
    "walletProfileId" TEXT NOT NULL,
    "effectiveMp" DECIMAL(24,4) NOT NULL,
    "dogeAllocated" DECIMAL(24,8) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiningAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referrerProfileId" TEXT NOT NULL,
    "referredProfileId" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "qualifiedAt" TIMESTAMP(3),
    "rewardedAt" TIMESTAMP(3),
    "bonusMpNewUser" INTEGER,
    "bonusMpReferrer" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletProfile_address_key" ON "WalletProfile"("address");

-- CreateIndex
CREATE UNIQUE INDEX "AuthNonce_nonce_key" ON "AuthNonce"("nonce");

-- CreateIndex
CREATE INDEX "AuthNonce_address_idx" ON "AuthNonce"("address");

-- CreateIndex
CREATE INDEX "LedgerEntry_walletProfileId_balanceType_idx" ON "LedgerEntry"("walletProfileId", "balanceType");

-- CreateIndex
CREATE INDEX "LedgerEntry_refType_refId_idx" ON "LedgerEntry"("refType", "refId");

-- CreateIndex
CREATE INDEX "MatchParticipant_walletProfileId_idx" ON "MatchParticipant"("walletProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchParticipant_matchId_walletProfileId_key" ON "MatchParticipant"("matchId", "walletProfileId");

-- CreateIndex
CREATE INDEX "MiningContract_walletProfileId_active_idx" ON "MiningContract"("walletProfileId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "MiningEpoch_epochDate_key" ON "MiningEpoch"("epochDate");

-- CreateIndex
CREATE INDEX "MiningAllocation_walletProfileId_idx" ON "MiningAllocation"("walletProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "MiningAllocation_epochId_walletProfileId_key" ON "MiningAllocation"("epochId", "walletProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_referredProfileId_key" ON "Referral"("referredProfileId");

-- CreateIndex
CREATE INDEX "Referral_referrerProfileId_idx" ON "Referral"("referrerProfileId");

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_walletProfileId_fkey" FOREIGN KEY ("walletProfileId") REFERENCES "WalletProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_walletProfileId_fkey" FOREIGN KEY ("walletProfileId") REFERENCES "WalletProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiningContract" ADD CONSTRAINT "MiningContract_walletProfileId_fkey" FOREIGN KEY ("walletProfileId") REFERENCES "WalletProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiningAllocation" ADD CONSTRAINT "MiningAllocation_epochId_fkey" FOREIGN KEY ("epochId") REFERENCES "MiningEpoch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiningAllocation" ADD CONSTRAINT "MiningAllocation_walletProfileId_fkey" FOREIGN KEY ("walletProfileId") REFERENCES "WalletProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerProfileId_fkey" FOREIGN KEY ("referrerProfileId") REFERENCES "WalletProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredProfileId_fkey" FOREIGN KEY ("referredProfileId") REFERENCES "WalletProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
