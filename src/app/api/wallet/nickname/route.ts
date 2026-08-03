import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

// Letters, numbers, spaces, underscore, hyphen only — keeps display
// predictable everywhere this renders (in-game HUD, match results,
// weekly leaderboard) without needing to worry about RTL/zero-width/
// homoglyph characters in a player-facing identity label. React already
// escapes rendered text either way, so this is about display sanity,
// not an XSS concern.
const NICKNAME_PATTERN = /^[a-zA-Z0-9_\- ]+$/;

const bodySchema = z.object({
  nickname: z
    .string()
    .trim()
    .max(24)
    .refine((s) => s.length === 0 || s.length >= 2, "Nickname must be at least 2 characters.")
    .refine((s) => s.length === 0 || NICKNAME_PATTERN.test(s), "Letters, numbers, spaces, - and _ only.")
    .nullable(),
});

// PATCH /api/wallet/nickname — self-set display name, shown in place of
// the wallet address wherever this player is identified to OTHER
// players (in-game HUD, multiplayer match results, weekly leaderboard).
// An empty string clears it, reverting to the wallet address everywhere
// it's shown, same as before this existed.
export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid nickname" }, { status: 400 });
  }

  const nickname = parsed.data.nickname && parsed.data.nickname.length > 0 ? parsed.data.nickname : null;
  await db.walletProfile.update({
    where: { id: session.walletProfileId },
    data: { nickname },
  });

  return NextResponse.json({ ok: true, nickname });
}
