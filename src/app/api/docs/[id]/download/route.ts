import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { db } from "@/lib/db";
import { docFilePath, ALLOWED_DOC_EXTENSIONS } from "@/lib/docsStorage";
import { getPlatformSettings } from "@/lib/settings";

// GET /api/docs/:id/download — public, no auth, streams the file (same
// not-buffered-into-memory reasoning as /api/download-apk). 404s if the
// menu is off, the doc was disabled/deleted, or the file is somehow
// missing from disk — never serves a broken download.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const settings = await getPlatformSettings();
  if (!settings.docsMenuEnabled) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const doc = await db.siteDocument.findUnique({ where: { id } });
  if (!doc || !doc.enabled) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const filePath = docFilePath(doc.id, doc.fileExt);
  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const contentType = ALLOWED_DOC_EXTENSIONS[doc.fileExt] ?? "application/octet-stream";
  // PDFs render fine inline in every modern browser (a whitepaper
  // should just open, not force a save dialog); everything else in the
  // allowlist (ppt/doc/xls/zip, ...) has no reliable in-browser viewer,
  // so those download instead.
  const disposition = doc.fileExt === "pdf" ? "inline" : "attachment";
  const safeName = doc.originalName.replace(/"/g, "");

  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(fileStat.size),
      "Content-Disposition": `${disposition}; filename="${safeName}"`,
      "Cache-Control": "no-store",
    },
  });
}
