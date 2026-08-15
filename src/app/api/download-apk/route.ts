import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { getAndroidApkInfo } from "@/lib/settings";
import { APK_STORAGE_PATH } from "@/lib/apkStorage";

// GET /api/download-apk — public, no auth: this is the actual button a
// visitor clicks. Streams the file (not buffered into memory) since
// this host is memory-constrained (next.config.ts already tunes for
// that) and there's no reason to hold a multi-MB file in RAM just to
// hand it back out. 404s with a plain message if no admin has uploaded
// one yet, rather than serving a broken/empty download.
export async function GET() {
  const info = await getAndroidApkInfo();
  if (!info) {
    return NextResponse.json({ error: "No Android build is available yet" }, { status: 404 });
  }

  let fileStat;
  try {
    fileStat = await stat(APK_STORAGE_PATH);
  } catch {
    return NextResponse.json({ error: "No Android build is available yet" }, { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(APK_STORAGE_PATH)) as ReadableStream;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/vnd.android.package-archive",
      "Content-Length": String(fileStat.size),
      "Content-Disposition": `attachment; filename="SpaceDoge.apk"`,
      "Cache-Control": "no-store",
    },
  });
}
