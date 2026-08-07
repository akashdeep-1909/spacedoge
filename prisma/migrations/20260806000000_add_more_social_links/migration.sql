-- Expands the footer's social icon set beyond X/Telegram/Discord/YouTube.
-- All nullable, same "blank = hide that icon" convention as the existing
-- social URL columns (see src/lib/settings.ts getSocialLinks).
ALTER TABLE "PlatformSettings" ADD COLUMN "instagramUrl" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "facebookUrl" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "linkedinUrl" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "redditUrl" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "tiktokUrl" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "mediumUrl" TEXT;
