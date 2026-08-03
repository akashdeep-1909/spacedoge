import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { generateInviteToken } from "@/lib/lobby";

// POST /api/lobbies/[id]/invite-link — host-only. Generates a fresh
// token and bumps inviteTokenVersion, which invalidates any
// previously issued link (its hash no longer matches any row).
// Only the token's sha256 hash is stored — never the raw token — same
// convention as this app never storing raw session secrets at rest.
// The URL never carries fee/pool/balance data (spec section 14) — a
// resolver looks all of that up server-side from the lobby id.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const lobby = await db.gameLobby.findUnique({ where: { id } });
  if (!lobby) return NextResponse.json({ error: "Lobby not found" }, { status: 404 });
  if (lobby.hostWalletProfileId !== session.walletProfileId) {
    return NextResponse.json({ error: "Only the host can manage the invite link" }, { status: 403 });
  }
  if (lobby.status !== "WAITING" && lobby.status !== "FULL") {
    return NextResponse.json({ error: "This lobby is no longer accepting players" }, { status: 409 });
  }

  const { token, hash } = generateInviteToken();
  await db.gameLobby.update({
    where: { id },
    data: { inviteTokenHash: hash, inviteTokenVersion: { increment: 1 } },
  });

  return NextResponse.json({ token });
}

// DELETE /api/lobbies/[id]/invite-link — host-only, disables the
// active link (if any) without issuing a replacement.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const lobby = await db.gameLobby.findUnique({ where: { id } });
  if (!lobby) return NextResponse.json({ error: "Lobby not found" }, { status: 404 });
  if (lobby.hostWalletProfileId !== session.walletProfileId) {
    return NextResponse.json({ error: "Only the host can manage the invite link" }, { status: 403 });
  }

  await db.gameLobby.update({ where: { id }, data: { inviteTokenHash: null } });
  return NextResponse.json({ ok: true });
}
