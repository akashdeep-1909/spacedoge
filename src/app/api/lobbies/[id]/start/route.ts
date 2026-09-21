import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { finalizeLobby, serializeLobby, lobbyNeedsMoreHumansForRentalBot, lobbyNeedsMoreHumansToStart } from "@/lib/lobby";
import { RENTAL_BOT_MIN_HUMANS, LOBBY_MIN_HUMANS_TO_START } from "@/lib/game-config";

// POST /api/lobbies/[id]/start — host-only "Start Game with AI Racers"
// early-start button. Fills every empty seat with a deterministic bot
// and finalizes the room economy exactly once, same finalizeLobby()
// path the 60s auto-expiry and the all-4-humans-joined auto-start use.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const lobby = await db.gameLobby.findUnique({ where: { id } });
  if (!lobby) return NextResponse.json({ error: "Lobby not found" }, { status: 404 });
  if (lobby.hostWalletProfileId !== session.walletProfileId) {
    return NextResponse.json({ error: "Only the host can start this lobby" }, { status: 403 });
  }
  if (lobby.status !== "WAITING" && lobby.status !== "FULL") {
    return NextResponse.json({ error: "Lobby can no longer be started" }, { status: 409 });
  }

  // Explicit product direction: "Play with Friends" must actually be
  // played with a friend — a host who invites nobody and clicks Start
  // anyway is functionally solo play wearing a lobby costume. See
  // LOBBY_MIN_HUMANS_TO_START's own doc-comment; the plain solo "Play"
  // button was never subject to this rule and is the way to actually
  // play alone against bots.
  if (await lobbyNeedsMoreHumansToStart(id)) {
    return NextResponse.json(
      { error: `Invite at least ${LOBBY_MIN_HUMANS_TO_START - 1} friend before starting, or play solo instead from the mode picker.` },
      { status: 409 }
    );
  }

  // Real enforcement of "Rental Bot only works with real friends" for
  // this specific action — the one deliberate way a host could
  // otherwise fill the room with AI the instant a Rental Bot is
  // equipped, functionally soloing with a lobby costume on. See
  // lobbyNeedsMoreHumansForRentalBot's own doc-comment.
  if (await lobbyNeedsMoreHumansForRentalBot(id)) {
    return NextResponse.json(
      { error: `A Space DOGE BOT is equipped in this lobby — it only works with real friends. Invite at least ${RENTAL_BOT_MIN_HUMANS} players total before starting with random players, or clear the Space DOGE BOT selection first.` },
      { status: 409 }
    );
  }

  await db.gameLobby.updateMany({
    where: { id, status: lobby.status, version: lobby.version },
    data: { status: "FILLING_AI", version: { increment: 1 } },
  });

  const result = await finalizeLobby(id);
  if (!result) {
    return NextResponse.json({ error: "Lobby could not be started, try again" }, { status: 409 });
  }

  return NextResponse.json(await serializeLobby(id, session.walletProfileId));
}
