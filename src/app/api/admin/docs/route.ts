import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";
import { DOCS_STORAGE_DIR, docFilePath, ALLOWED_DOC_EXTENSIONS, MAX_DOC_BYTES } from "@/lib/docsStorage";

// GET /api/admin/docs — every document, enabled or not (the site nav
// dropdown only sees enabled ones with the menu itself turned on — see
// /api/docs), so the admin page can manage everything from one list.
export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const rows = await db.siteDocument.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return NextResponse.json({ rows });
}

// POST /api/admin/docs — adds a new document (multipart/form-data:
// `title` + `file`). Each doc gets its own file on disk, named after
// its own row id (see src/lib/docsStorage.ts) — unlike the Android
// APK there's no single "current" slot to overwrite, this is a list.
export async function POST(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid upload" }, { status: 400 });

  const titleRaw = form.get("title");
  const title = typeof titleRaw === "string" ? titleRaw.trim() : "";
  if (!title || title.length > 120) {
    return NextResponse.json({ error: "Title is required (max 120 characters)" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ext || !(ext in ALLOWED_DOC_EXTENSIONS)) {
    return NextResponse.json(
      { error: `Unsupported file type. Allowed: ${Object.keys(ALLOWED_DOC_EXTENSIONS).join(", ")}` },
      { status: 400 }
    );
  }
  if (file.size > MAX_DOC_BYTES) {
    return NextResponse.json({ error: `File is too large (max ${MAX_DOC_BYTES / (1024 * 1024)}MB)` }, { status: 400 });
  }

  const rowCount = await db.siteDocument.count();
  const created = await db.siteDocument.create({
    data: {
      title,
      fileExt: ext,
      originalName: file.name,
      fileSizeBytes: file.size,
      sortOrder: rowCount,
    },
  });

  await mkdir(DOCS_STORAGE_DIR, { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(docFilePath(created.id, ext), bytes);

  return NextResponse.json({ ok: true, row: created });
}
