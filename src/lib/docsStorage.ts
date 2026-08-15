import path from "node:path";

// Same reasoning as APK_STORAGE_DIR (src/lib/apkStorage.ts): outside
// .next/ (wiped every deploy via `rm -rf .next` in deploy.sh) and
// outside any git-tracked directory (gitignored — see .gitignore), so
// a `git pull` + rebuild never touches it. Unlike the APK, there can
// be many documents at once, so each gets its own file named after its
// SiteDocument row's own id instead of one fixed overwritten filename.
export const DOCS_STORAGE_DIR = path.join(process.cwd(), "storage", "uploads", "docs");

export function docFilePath(id: string, fileExt: string): string {
  return path.join(DOCS_STORAGE_DIR, `${id}.${fileExt}`);
}

// Extensions an admin can upload here, and the Content-Type the
// download route serves them as. Deliberately a curated allowlist
// (not "any file") since this is a public, unauthenticated download
// endpoint.
export const ALLOWED_DOC_EXTENSIONS: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
  zip: "application/zip",
};

export const MAX_DOC_BYTES = 50 * 1024 * 1024; // 50MB — generous for a whitepaper/deck, small enough not to strain the host
