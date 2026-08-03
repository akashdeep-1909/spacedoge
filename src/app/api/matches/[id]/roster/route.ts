import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { pickBotNames, shortenWalletAddress } from "@/lib/game-config";

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
  const seats = match.participants.map((p) => {
    const isYou = p.walletProfileId === session.walletProfileId;
    const label = p.isBot
      ? `@${botNames[botIdx++]}`
      : p.walletProfile.nickname || shortenWalletAddress(p.walletProfile.address);
    return { slotNumber: p.slotNumber, isBot: p.isBot, isYou, label };
  });

  return NextResponse.json({ seats });
}
