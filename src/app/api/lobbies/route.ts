import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { lockWalletForBalanceChange, getLedgerBalance } from "@/lib/balances";
import { BalanceType } from "@/generated/prisma/enums";
import {
  LOBBY_WAIT_SECONDS,
  checkPaidEligibility,
  generateRoomCode,
  holdEntryFee,
  resolveStakesModeByPackageAmount,
  serializeLobby,
} from "@/lib/lobby";

const bodySchema = z.object({ packageAmount: z.number() });

// POST /api/lobbies — host creates a "Play with Friends" lobby for one
// of the currently-enabled paid stakes packages (never a custom amount
// or a client-supplied fee/pool/mode — packageAmount is only ever
// matched against each mode's live admin-configured entry fee, see
// src/lib/lobby.ts's resolveStakesModeByPackageAmount). Reserves the
// host's own entry fee immediately and starts the server-authoritative
// 60s join window.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const cfg = await resolveStakesModeByPackageAmount(parsed.data.packageAmount);
  if (!cfg) return NextResponse.json({ error: "Unsupported package amount" }, { status: 400 });
  const mode = cfg.mode;

  const walletProfile = await db.walletProfile.findUnique({ where: { id: session.walletProfileId } });
  if (!walletProfile) return NextResponse.json({ error: "Wallet profile not found" }, { status: 404 });

  const entryFeeUsdt = Number(cfg.entryFeeUsdt);
  const eligibility = await checkPaidEligibility(walletProfile, walletProfile.id, entryFeeUsdt);
  if (eligibility) return NextResponse.json({ error: eligibility.error }, { status: eligibility.status });

  const mapSeed = randomUUID();

  let roomCode = generateRoomCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await db.gameLobby.findUnique({ where: { roomCode } });
    if (!existing) break;
    roomCode = generateRoomCode();
  }

  // checkPaidEligibility above already did a first-pass balance check,
  // but unlocked — re-checked here, after the lock, for the actual
  // race-safe guard (two concurrent lobby-creation/join requests from
  // the same wallet could otherwise both pass that first check and
  // both hold an entry fee against one balance).
  const outcome = await db.$transaction(async (tx) => {
    await lockWalletForBalanceChange(tx, walletProfile.id);

    if (entryFeeUsdt > 0) {
      const playUsdt = await getLedgerBalance(tx, walletProfile.id, BalanceType.PLAY_USDT);
      if (playUsdt < entryFeeUsdt) return { kind: "insufficient" as const };
    }

    const created = await tx.gameLobby.create({
      data: {
        roomCode,
        hostWalletProfileId: walletProfile.id,
        mode,
        entryFeeUsdt,
        durationSec: cfg.durationSec,
        mapSeed,
        expiresAt: new Date(Date.now() + LOBBY_WAIT_SECONDS * 1000),
      },
    });

    const holdLedgerId =
      entryFeeUsdt > 0
        ? await holdEntryFee(tx, { walletProfileId: walletProfile.id, entryFeeUsdt, lobbyId: created.id })
        : null;

    await tx.lobbyParticipant.create({
      data: {
        lobbyId: created.id,
        walletProfileId: walletProfile.id,
        slotNumber: 1,
        joinSource: "HOST",
        entryHoldLedgerId: holdLedgerId,
      },
    });

    return { kind: "created" as const, lobby: created };
  });

  if (outcome.kind === "insufficient") {
    return NextResponse.json({ error: `You need at least ${entryFeeUsdt} USDT in your Deposit USDT to join this match.` }, { status: 402 });
  }

  return NextResponse.json(await serializeLobby(outcome.lobby.id, walletProfile.id));
}
