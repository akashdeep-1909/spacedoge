
-- AlterEnum
ALTER TYPE "ShopItemCategory" ADD VALUE 'RENTAL_BOT';

-- AlterTable
ALTER TABLE "LobbyParticipant" ADD COLUMN     "walletShopItemId" TEXT;

-- AddForeignKey
ALTER TABLE "LobbyParticipant" ADD CONSTRAINT "LobbyParticipant_walletShopItemId_fkey" FOREIGN KEY ("walletShopItemId") REFERENCES "WalletShopItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

