-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "durationSec" INTEGER;

-- CreateTable
CREATE TABLE "GameModeConfig" (
    "id" TEXT NOT NULL,
    "mode" "GameMode" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "entryFeeUsdt" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "durationSec" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "prefundedPoolUsdt" DECIMAL(18,6),
    "cooldownHours" INTEGER,
    "eligibilityWindowHours" INTEGER,
    "eligibilityMinPlays" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameModeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameModeConfig_mode_key" ON "GameModeConfig"("mode");
