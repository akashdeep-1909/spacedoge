/*
  Warnings:

  - Added the required column `leafIndex` to the `ReserveSnapshotLeaf` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ReserveSnapshotLeaf" ADD COLUMN     "leafIndex" INTEGER NOT NULL;
