-- Docs nav dropdown — see src/app/api/admin/docs/route.ts. The menu
-- toggle defaults off (same "hidden until an admin turns it on"
-- convention as the Android APK release fields); the document list
-- starts empty until the admin adds something.
ALTER TABLE "PlatformSettings" ADD COLUMN "docsMenuEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "SiteDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileExt" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteDocument_pkey" PRIMARY KEY ("id")
);
