import { z } from "zod";

// POST /api/admin/users/[id]/risk-flag's own validation, factored out
// of that route file specifically because Next's route-handler type
// checker in this version rejects any named export from a route.ts
// other than the HTTP method handlers themselves — confirmed live via
// a real tsc error the moment an equivalent schema lived inline in
// src/app/api/admin/shop/route.ts (see shopAdminSchema.ts's own
// doc-comment for the exact error). Lives here instead so both the
// route AND scripts/smoke-test-admin-block.ts (no real admin session
// available in a script, so it asserts this schema directly) can
// import the exact same validation.
//
// A note is REQUIRED when setting riskFlag to "blocked" — mirroring
// withdrawalRestrictedNote's own precedent (see that route's own
// doc-comment). A blocked wallet is refused a session entirely
// (src/app/api/auth/verify/route.ts) and, if already signed in, is
// shown a dedicated full-page block screen on every /dashboard/*
// request (src/app/dashboard/layout.tsx) showing this exact text — so
// it can never be left blank. "review" is a softer classification with
// no enforcement of its own; a note is accepted but optional there for
// consistency. Clearing back to null always clears the note/timestamp
// too rather than keeping stale history around.
export const riskFlagBodySchema = z.union([
  z.object({ riskFlag: z.literal("blocked"), note: z.string().trim().min(1) }),
  z.object({ riskFlag: z.literal("review"), note: z.string().trim().optional() }),
  z.object({ riskFlag: z.null() }),
]);
