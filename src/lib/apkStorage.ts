import path from "node:path";

// Outside .next/ (wiped every deploy via `rm -rf .next` in deploy.sh)
// and outside any git-tracked directory (gitignored — see .gitignore),
// so a `git pull` + rebuild never touches it. Always the same single
// path, overwritten in place on every upload — there's only ever one
// "current" Android build to offer, matching PlatformSettings' own
// singleton-row convention (src/lib/settings.ts).
export const APK_STORAGE_DIR = path.join(process.cwd(), "storage", "uploads", "apk");
export const APK_STORAGE_PATH = path.join(APK_STORAGE_DIR, "current.apk");
