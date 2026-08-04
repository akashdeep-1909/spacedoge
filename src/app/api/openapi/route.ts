import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import spec from "@/lib/openapi-spec.json";

// GET /api/openapi — the raw spec the Swagger UI at /api fetches.
// Admin-gated same as the page itself (see src/app/api/page.tsx) —
// this is the second half of that gate: the page check alone doesn't
// stop someone from just fetching the spec directly, so this endpoint
// needs its own check too. Moved out of public/ (previously
// public/openapi.json, served with zero auth to anyone) specifically
// so it CAN be gated — a public/ file has no way to run a session
// check before Next.js serves it.
export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  return NextResponse.json(spec);
}
