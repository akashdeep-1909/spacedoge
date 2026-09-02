-- Coin Rush Shop — Phase 1 schema (see the shop plan: rocket
-- cosmetics now, stat/power-up purchases + extra time in later
-- phases reuse these same tables/columns, no further migration
-- needed for their shape).
-- CreateEnum
CREATE TYPE "ShopItemCategory" AS ENUM ('ROCKET_SHAPE', 'STAT_SPEED', 'STAT_HEALTH', 'POWERUP_MAGNET', 'POWERUP_FIRE', 'POWERUP_SHIELD', 'EXTRA_TIME');

-- CreateEnum
CREATE TYPE "ShopEntitlementType" AS ENUM ('USES', 'TIME_WINDOW');

-- CreateTable
CREATE TABLE "ShopItemConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "category" "ShopItemCategory" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceUsdt" DECIMAL(18,6) NOT NULL,
    "entitlementType" "ShopEntitlementType" NOT NULL,
    "usesGranted" INTEGER,
    "termDays" INTEGER,
    "shapeKey" TEXT,
    "speedMultBonus" DECIMAL(6,4),
    "livesBonus" INTEGER,
    "magnetDurationBonusSec" DECIMAL(6,2),
    "magnetCooldownDeltaSec" DECIMAL(6,2),
    "fireExtraUses" INTEGER,
    "fireDurationBonusSec" DECIMAL(6,2),
    "shieldDurationBonusSec" DECIMAL(6,2),
    "shieldCooldownDeltaSec" DECIMAL(6,2),
    "extraTimeSec" INTEGER,
    "modeRestriction" "GameMode"[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopItemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletShopItem" (
    "id" TEXT NOT NULL,
    "walletProfileId" TEXT NOT NULL,
    "shopItemConfigId" TEXT NOT NULL,
    "category" "ShopItemCategory" NOT NULL,
    "entitlementType" "ShopEntitlementType" NOT NULL,
    "shapeKey" TEXT,
    "speedMultBonus" DECIMAL(6,4),
    "livesBonus" INTEGER,
    "magnetDurationBonusSec" DECIMAL(6,2),
    "magnetCooldownDeltaSec" DECIMAL(6,2),
    "fireExtraUses" INTEGER,
    "fireDurationBonusSec" DECIMAL(6,2),
    "shieldDurationBonusSec" DECIMAL(6,2),
    "shieldCooldownDeltaSec" DECIMAL(6,2),
    "extraTimeSec" INTEGER,
    "pricePaidUsdt" DECIMAL(18,6) NOT NULL,
    "usesRemaining" INTEGER,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletShopItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchLoadout" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "walletProfileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchLoadout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchLoadoutSelection" (
    "id" TEXT NOT NULL,
    "matchLoadoutId" TEXT NOT NULL,
    "walletShopItemId" TEXT NOT NULL,
    "category" "ShopItemCategory" NOT NULL,

    CONSTRAINT "MatchLoadoutSelection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopItemConfig_key_key" ON "ShopItemConfig"("key");

-- CreateIndex
CREATE INDEX "WalletShopItem_walletProfileId_category_active_idx" ON "WalletShopItem"("walletProfileId", "category", "active");

-- CreateIndex
CREATE UNIQUE INDEX "MatchLoadout_matchId_walletProfileId_key" ON "MatchLoadout"("matchId", "walletProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchLoadoutSelection_matchLoadoutId_category_key" ON "MatchLoadoutSelection"("matchLoadoutId", "category");

-- AddForeignKey
ALTER TABLE "WalletShopItem" ADD CONSTRAINT "WalletShopItem_walletProfileId_fkey" FOREIGN KEY ("walletProfileId") REFERENCES "WalletProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletShopItem" ADD CONSTRAINT "WalletShopItem_shopItemConfigId_fkey" FOREIGN KEY ("shopItemConfigId") REFERENCES "ShopItemConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchLoadout" ADD CONSTRAINT "MatchLoadout_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchLoadout" ADD CONSTRAINT "MatchLoadout_walletProfileId_fkey" FOREIGN KEY ("walletProfileId") REFERENCES "WalletProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchLoadoutSelection" ADD CONSTRAINT "MatchLoadoutSelection_matchLoadoutId_fkey" FOREIGN KEY ("matchLoadoutId") REFERENCES "MatchLoadout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchLoadoutSelection" ADD CONSTRAINT "MatchLoadoutSelection_walletShopItemId_fkey" FOREIGN KEY ("walletShopItemId") REFERENCES "WalletShopItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

