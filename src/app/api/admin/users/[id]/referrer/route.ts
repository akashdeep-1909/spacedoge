import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";

// Admin override for the referral edge normally only ever written once,
// automatically, at first-connect (applyReferralCode in src/lib/
// referrals.ts, via a ?ref= link) — for the real-world cases that flow
// can't cover: a user who connected before sharing/using a referral
// link, a support request to fix a mistyped/missing referral, or an
// admin deliberately attributing an existing wallet to a KOL/partner
// after the fact. Same auth gate and response shape as the sibling
// kol/risk-flag routes.
//
// referrerAddress: null (or "") clears any existing referral for this
// wallet outright — the referred wallet goes back to having no
// referrer, same as if it had never used a referral link.
const bodySchema = z.object({ referrerAddress: z.string().trim().toLowerCase().nullable() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id: referredProfileId } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid referrerAddress" }, { status: 400 });

  const referredProfile = await db.walletProfile.findUnique({ where: { id: referredProfileId } });
  if (!referredProfile) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const address = parsed.data.referrerAddress?.trim();
  if (!address) {
    // Clear — a no-op (not an error) if there was nothing to clear,
    // same idempotent spirit as the rest of this app's admin actions.
    await db.referral.deleteMany({ where: { referredProfileId } });
    return NextResponse.json({ ok: true });
  }

  const referrer = await db.walletProfile.findUnique({ where: { address } });
  if (!referrer) return NextResponse.json({ error: "No wallet found with that address." }, { status: 404 });
  if (referrer.id === referredProfileId) {
    return NextResponse.json({ error: "A wallet can't refer itself." }, { status: 400 });
  }

  // Guard against the one cheap-to-check circular case — the candidate
  // referrer's own referrer is the wallet we're about to attribute to
  // them (a mutual 2-cycle: A refers B, B refers A). Referral.status'
  // reward math only ever walks exactly one hop up (see
  // batchLookupMiningReferrals's own doc-comment), so this can't cause
  // an infinite loop either way — it's rejected purely because a wallet
  // referring the person who referred it isn't a real relationship
  // worth allowing an admin to create by mistake.
  const referrersOwnReferral = await db.referral.findUnique({ where: { referredProfileId: referrer.id } });
  if (referrersOwnReferral?.referrerProfileId === referredProfileId) {
    return NextResponse.json({ error: "That would make each wallet the other's referrer." }, { status: 400 });
  }

  // referredProfileId is @unique on Referral (one referrer per wallet,
  // ever) — upsert so re-pointing an existing edge to a different
  // referrer is a normal update, not a P2002 conflict. Deliberately
  // leaves status/qualifiedAt/rewardedAt untouched on reassignment:
  // those track this wallet's own reward history, which isn't tied to
  // which referrer id is currently attached (past ledger entries key on
  // refType/refId — Match/MiningEpoch — never on Referral.id, so
  // nothing historical is orphaned by changing referrerProfileId here).
  await db.referral.upsert({
    where: { referredProfileId },
    create: { referrerProfileId: referrer.id, referredProfileId },
    update: { referrerProfileId: referrer.id },
  });

  return NextResponse.json({ ok: true });
}
