
-- CreateTable
CREATE TABLE "LobbyParticipantSelection" (
    "id" TEXT NOT NULL,
    "lobbyParticipantId" TEXT NOT NULL,
    "walletShopItemId" TEXT NOT NULL,
    "category" "ShopItemCategory" NOT NULL,

    CONSTRAINT "LobbyParticipantSelection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LobbyParticipantSelection_lobbyParticipantId_category_key" ON "LobbyParticipantSelection"("lobbyParticipantId", "category");

-- AddForeignKey
ALTER TABLE "LobbyParticipantSelection" ADD CONSTRAINT "LobbyParticipantSelection_lobbyParticipantId_fkey" FOREIGN KEY ("lobbyParticipantId") REFERENCES "LobbyParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LobbyParticipantSelection" ADD CONSTRAINT "LobbyParticipantSelection_walletShopItemId_fkey" FOREIGN KEY ("walletShopItemId") REFERENCES "WalletShopItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

