import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

// GET /api/players/recent — real (non-bot) wallets the caller has
// shared a match with before, most recently played together first.
// Powers the "Recent Players" quick-invite list in the Play with
// Friends lobby (src/app/dashboard/play/lobby/[id]/page.tsx), so
// re-inviting someone you've already played doesn't mean re-typing
// their address every time.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const myMatches = await db.matchParticipant.findMany({
    where: { walletProfileId: session.walletProfileId, isBot: false },
    select: { matchId: true },
    take: 200,
    orderBy: { createdAt: "desc" },
  });
  const matchIds = myMatches.map((m) => m.matchId);
  if (matchIds.length === 0) return NextResponse.json({ players: [] });

  const coParticipants = await db.matchParticipant.findMany({
    where: { matchId: { in: matchIds }, isBot: false, walletProfileId: { not: session.walletProfileId } },
    select: {
      walletProfileId: true,
      createdAt: true,
      walletProfile: { select: { address: true, nickname: true, riskFlag: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const byWallet = new Map<string, { address: string; nickname: string | null; gamesTogether: number; lastPlayedAt: Date }>();
  for (const p of coParticipants) {
    if (p.walletProfile.riskFlag === "blocked") continue;
    const existing = byWallet.get(p.walletProfileId);
    if (existing) {
      existing.gamesTogether += 1;
    } else {
      byWallet.set(p.walletProfileId, {
        address: p.walletProfile.address,
        nickname: p.walletProfile.nickname,
        gamesTogether: 1,
        lastPlayedAt: p.createdAt,
      });
    }
  }

  const players = Array.from(byWallet.values())
    .sort((a, b) => b.lastPlayedAt.getTime() - a.lastPlayedAt.getTime())
    .slice(0, 10);

  return NextResponse.json({ players });
}
