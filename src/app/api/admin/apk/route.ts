import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { requireAdminSession } from "@/lib/admin";
import { getAndroidApkInfo, setAndroidApkInfo } from "@/lib/settings";
import { APK_STORAGE_DIR, APK_STORAGE_PATH } from "@/lib/apkStorage";

const MAX_APK_BYTES = 200 * 1024 * 1024; // 200MB — this app's own build is ~2-5MB; generous headroom, not a real limit in practice

// GET /api/admin/apk — current upload's metadata, so the admin page
// can show "last uploaded: v1.0.1, 2.1MB, 2026-08-16" without ever
// reading the file itself.
export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const info = await getAndroidApkInfo();
  return NextResponse.json({ apk: info });
}

// POST /api/admin/apk — replaces the single current APK in place
// (multipart/form-data: `file` + optional `versionLabel`). There is no
// per-version history; uploading a new build simply overwrites the one
// GET /api/download/apk serves. See src/lib/apkStorage.ts for why the
// file lives outside .next/ and outside git.
export async function POST(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid upload" }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".apk")) {
    return NextResponse.json({ error: "File must be a .apk" }, { status: 400 });
  }
  if (file.size > MAX_APK_BYTES) {
    return NextResponse.json({ error: `File is too large (max ${MAX_APK_BYTES / (1024 * 1024)}MB)` }, { status: 400 });
  }

  const versionLabelRaw = form.get("versionLabel");
  const versionLabel = typeof versionLabelRaw === "string" && versionLabelRaw.trim() ? versionLabelRaw.trim() : null;

  await mkdir(APK_STORAGE_DIR, { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(APK_STORAGE_PATH, bytes);

  await setAndroidApkInfo(
    { originalName: file.name, versionLabel, fileSizeBytes: bytes.byteLength },
    session.address.toLowerCase()
  );

  const info = await getAndroidApkInfo();
  return NextResponse.json({ ok: true, apk: info });
}
