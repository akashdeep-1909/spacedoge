import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { setLobbyLoadoutSelection, serializeLobby } from "@/lib/lobby";
import { SOLO_LOADOUT_CATEGORIES } from "@/lib/shop-shared";

const bodySchema = z.object({
  category: z.enum(SOLO_LOADOUT_CATEGORIES),
  walletShopItemId: z.string().min(1).nullable(),
});

// PATCH /api/lobbies/[id]/loadout — the caller's own selection for one
// non-RENTAL_BOT category (a rocket skin, or a Speed/Health/Magnet/
// Fire/Shield upgrade) for THIS lobby. RENTAL_BOT stays on the
// separate PATCH /api/lobbies/[id]/rental-bot route (see that route's
// own doc-comment) — this is its general-purpose sibling, added
// because Play-with-Friends had never actually consumed anything from
// these categories at all. Callable any time before the lobby starts;
// see setLobbyLoadoutSelection's own doc-comment in src/lib/lobby.ts
// for the full validation/consumption split (validated here, actually
// consumed only once the match finalizes).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const result = await setLobbyLoadoutSelection(id, session.walletProfileId, parsed.data.category, parsed.data.walletShopItemId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(await serializeLobby(id, session.walletProfileId));
}
