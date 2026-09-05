import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { setLobbyRentalBot, serializeLobby } from "@/lib/lobby";

const bodySchema = z.object({ walletShopItemId: z.string().min(1).nullable() });

// PATCH /api/lobbies/[id]/rental-bot — the caller's own Rental Bot
// selection for THIS lobby (host or joiner — whichever of the 3 join
// paths got them here, they all land on the same lobby waiting-room
// page, the one shared surface this is called from). Callable any
// time before the lobby starts; see setLobbyRentalBot's own
// doc-comment in src/lib/lobby.ts for the full validation/consumption
// split (validated here, actually consumed only once the match
// finalizes).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const result = await setLobbyRentalBot(id, session.walletProfileId, parsed.data.walletShopItemId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(await serializeLobby(id, session.walletProfileId));
}
