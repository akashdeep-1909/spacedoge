-- CreateEnum
CREATE TYPE "LobbyStatus" AS ENUM ('WAITING', 'FULL', 'FILLING_AI', 'STARTING', 'STARTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'ROOM_FULL', 'MATCH_STARTED');

-- AlterEnum
ALTER TYPE "MatchStatus" ADD VALUE 'SETTLED';

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "resultsDeadlineAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MatchParticipant" ADD COLUMN     "joinSource" TEXT,
ADD COLUMN     "resultSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "slotNumber" INTEGER;

-- CreateTable
CREATE TABLE "GameLobby" (
    "id" TEXT NOT NULL,
    "roomCode" TEXT NOT NULL,
    "hostWalletProfileId" TEXT NOT NULL,
    "mode" "GameMode" NOT NULL,
    "entryFeeUsdt" DECIMAL(18,6) NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "status" "LobbyStatus" NOT NULL DEFAULT 'WAITING',
    "mapSeed" TEXT NOT NULL,
    "inviteTokenHash" TEXT,
    "inviteTokenVersion" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "finalMatchId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameLobby_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LobbyParticipant" (
    "id" TEXT NOT NULL,
    "lobbyId" TEXT NOT NULL,
    "walletProfileId" TEXT NOT NULL,
    "slotNumber" INTEGER NOT NULL,
    "joinSource" TEXT NOT NULL,
    "entryHoldLedgerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'JOINED',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "LobbyParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LobbyInvitation" (
    "id" TEXT NOT NULL,
    "lobbyId" TEXT NOT NULL,
    "senderWalletProfileId" TEXT NOT NULL,
    "recipientWalletProfileId" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LobbyInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameLobby_roomCode_key" ON "GameLobby"("roomCode");

-- CreateIndex
CREATE UNIQUE INDEX "GameLobby_inviteTokenHash_key" ON "GameLobby"("inviteTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "GameLobby_finalMatchId_key" ON "GameLobby"("finalMatchId");

-- CreateIndex
CREATE INDEX "GameLobby_status_expiresAt_idx" ON "GameLobby"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "LobbyParticipant_lobbyId_walletProfileId_key" ON "LobbyParticipant"("lobbyId", "walletProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "LobbyParticipant_lobbyId_slotNumber_key" ON "LobbyParticipant"("lobbyId", "slotNumber");

-- CreateIndex
CREATE INDEX "LobbyInvitation_lobbyId_idx" ON "LobbyInvitation"("lobbyId");

-- CreateIndex
CREATE INDEX "LobbyInvitation_recipientWalletProfileId_status_idx" ON "LobbyInvitation"("recipientWalletProfileId", "status");

-- AddForeignKey
ALTER TABLE "GameLobby" ADD CONSTRAINT "GameLobby_hostWalletProfileId_fkey" FOREIGN KEY ("hostWalletProfileId") REFERENCES "WalletProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameLobby" ADD CONSTRAINT "GameLobby_finalMatchId_fkey" FOREIGN KEY ("finalMatchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LobbyParticipant" ADD CONSTRAINT "LobbyParticipant_lobbyId_fkey" FOREIGN KEY ("lobbyId") REFERENCES "GameLobby"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LobbyParticipant" ADD CONSTRAINT "LobbyParticipant_walletProfileId_fkey" FOREIGN KEY ("walletProfileId") REFERENCES "WalletProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LobbyInvitation" ADD CONSTRAINT "LobbyInvitation_lobbyId_fkey" FOREIGN KEY ("lobbyId") REFERENCES "GameLobby"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LobbyInvitation" ADD CONSTRAINT "LobbyInvitation_senderWalletProfileId_fkey" FOREIGN KEY ("senderWalletProfileId") REFERENCES "WalletProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LobbyInvitation" ADD CONSTRAINT "LobbyInvitation_recipientWalletProfileId_fkey" FOREIGN KEY ("recipientWalletProfileId") REFERENCES "WalletProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
