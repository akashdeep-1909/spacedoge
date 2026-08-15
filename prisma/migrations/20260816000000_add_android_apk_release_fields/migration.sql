-- Android direct-download APK metadata (the file itself lives on disk,
-- not in the DB — see src/app/api/admin/apk/route.ts). All nullable:
-- null means no APK has been uploaded yet, same "blank = not set"
-- convention as this table's other optional columns.
ALTER TABLE "PlatformSettings" ADD COLUMN "androidApkOriginalName" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "androidApkVersionLabel" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "androidApkFileSizeBytes" INTEGER;
ALTER TABLE "PlatformSettings" ADD COLUMN "androidApkUploadedAt" TIMESTAMP(3);
