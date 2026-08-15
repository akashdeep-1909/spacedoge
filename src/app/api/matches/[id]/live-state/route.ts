import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getLiveMatchState, setLiveShipState } from "@/lib/liveMatchState";

const reportSchema = z.object({
  xFrac: z.number().min(0).max(1),
  yFrac: z.number().min(0).max(1),
  carry: z.number().min(0),
  banked: z.number().min(0),
  lives: z.number().int().min(0),
  alive: z.boolean(),
});

// POST /api/matches/[id]/live-state — an actively-racing human's own
// client fire-and-forget reports its current ship position/carry/lives
// every ~350ms (see CoinRushArena's reporting branch), so a player who
// already finished their run can spectate the others live (GET below).
// Never touches Postgres — see src/lib/liveMatchState.ts for why.
//
// Self-reported, like every other in-match number this app already
// trusts (final scores included — see results/route.ts's "KNOWN GAP"
// comment). This isn't a new category of risk, just a higher-frequency
// one, bounded by the same cheap plausibility floor (fraction in
// [0,1], non-negative counts) rather than a hard guarantee — this data
// is purely cosmetic (what a spectator sees), never fed into scoring
// or settlement.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id: matchId } = await params;
  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid live-state payload" }, { status: 400 });

  const match = await db.match.findUnique({ where: { id: matchId }, include: { participants: true } });
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  const me = match.participants.find((p) => p.walletProfileId === session.walletProfileId && !p.isBot);
  if (!me) return NextResponse.json({ error: "Not a participant in this match" }, { status: 403 });
  if (me.slotNumber == null) return NextResponse.json({ ok: true }); // defensive — shouldn't happen for a lobby-originated match

  setLiveShipState(matchId, me.slotNumber, { ...parsed.data, updatedAt: Date.now() });
  return NextResponse.json({ ok: true });
}

// GET /api/matches/[id]/live-state — polled by a spectating client
// (see useLiveMatchState) every ~350ms while waiting for others to
// finish. Membership-gated the same way as roster/route.ts: only
// someone actually in this match can see the others' live positions.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id: matchId } = await params;
  const match = await db.match.findUnique({ where: { id: matchId }, include: { participants: true } });
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  const isParticipant = match.participants.some((p) => p.walletProfileId === session.walletProfileId);
  if (!isParticipant) return NextResponse.json({ error: "Not a participant in this match" }, { status: 403 });

  return NextResponse.json({ slots: getLiveMatchState(matchId) });
}
