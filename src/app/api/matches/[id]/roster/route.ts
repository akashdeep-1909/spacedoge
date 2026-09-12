import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { pickBotNames, shortenWalletAddress } from "@/lib/game-config";
import { getResolvedLoadoutForMatch } from "@/lib/shop";

// GET /api/matches/[id]/roster — the real identity of every seat in a
// match, ordered by slotNumber. CoinRushArena has no other way to know
// who's actually in the other 3 ships: it draws purely-cosmetic bot
// names from a seeded pool regardless of whether a seat is a real human
// or an AI fill-in, so a genuine "Play with Friends" match showed fake
// names for real opponents. This resolves each seat to a nickname (or
// shortened wallet address) for humans, and a seeded bot-pool name for
// AI-filled seats — same seeded draw CoinRushArena used to do locally,
// just computed once here so it's consistent for every viewer.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const match = await db.match.findUnique({
    where: { id },
    include: {
      participants: {
        include: { walletProfile: { select: { id: true, address: true, nickname: true } } },
        orderBy: { slotNumber: "asc" },
      },
    },
  });
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  const isParticipant = match.participants.some((p) => p.walletProfileId === session.walletProfileId);
  if (!isParticipant) return NextResponse.json({ error: "Not a participant in this match" }, { status: 403 });

  const botNames = pickBotNames(match.mapSeed, match.participants.filter((p) => p.isBot).length);
  let botIdx = 0;

  // Every participant's own ROCKET_SHAPE selection (if any) — one query
  // for the whole match rather than N calls to getResolvedLoadoutForMatch
  // below, which is deliberately scoped to a single wallet (the
  // caller's own). CoinRushArena has no other way to learn what a
  // FRIEND actually equipped: the local bot-AI branch that drives every
  // non-you ship (including a real friend's own seat, during active
  // play — see that branch's own doc-comment) had no cosmetic data to
  // draw with at all, so every opponent always rendered the default
  // ship regardless of what they'd actually bought — confirmed live as
  // a real gap ("only the rocket owner sees their own rocket").
  // Speed/Health/Magnet/Fire/Shield are deliberately NOT included here
  // — those are invisible bonuses with no on-screen appearance, only
  // the rocket's own look needs to be shared with everyone else in the
  // match.
  const rocketSelections = await db.matchLoadoutSelection.findMany({
    where: { matchLoadout: { matchId: id }, category: "ROCKET_SHAPE" },
    include: {
      matchLoadout: { select: { walletProfileId: true } },
      walletShopItem: { select: { shapeKey: true, colorHex: true } },
    },
  });
  const rocketByWallet = new Map(rocketSelections.map((s) => [s.matchLoadout.walletProfileId, s.walletShopItem]));

  const seats = match.participants.map((p) => {
    const isYou = p.walletProfileId === session.walletProfileId;
    const label = p.isBot
      ? `@${botNames[botIdx++]}`
      : p.walletProfile.nickname || shortenWalletAddress(p.walletProfile.address);
    const rocket = rocketByWallet.get(p.walletProfileId);
    return {
      slotNumber: p.slotNumber,
      isBot: p.isBot,
      isYou,
      label,
      shapeKey: rocket?.shapeKey ?? null,
      colorHex: rocket?.colorHex ?? null,
    };
  });

  // Lobby (Play-with-Friends) matches never pass a `loadout` prop into
  // CoinRushArena today — this is how that page learns whether a
  // Rental Bot (or any other shop item, generically) was actually
  // resolved for the CALLER's own seat, reconstructed from the durable
  // MatchLoadoutSelection audit trail regardless of how this match was
  // created (see getResolvedLoadoutForMatch's own doc-comment — it's
  // the exact same helper GET /api/matches/active already uses for the
  // solo-resume-after-refresh case).
  const loadout = await getResolvedLoadoutForMatch(id, session.walletProfileId);

  return NextResponse.json({ seats, loadout });
}
