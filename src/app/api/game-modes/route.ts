import { NextResponse } from "next/server";
import { GameMode } from "@/generated/prisma/enums";
import { getSession } from "@/lib/session";
import { getGameModeConfigs, checkPromoEligibility, checkModeCooldown } from "@/lib/gameModes";
import { checkKolBonusEligibility } from "@/lib/referrals";

// GET /api/game-modes — every enabled mode's admin-configured
// parameters, for the "Choose Game Mode" page. Authenticated (not the
// public /api/settings/public pattern) because promo-mode visibility
// depends on the caller's own recent play count: a mode gated by
// checkPromoEligibility() is omitted entirely for a wallet that
// doesn't currently qualify, rather than shown-but-disabled.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const configs = await getGameModeConfigs({ enabledOnly: true });

  // KOL_REFERRAL_BONUS is gated by a lifetime 3-play/300-PTS cap
  // (checkKolBonusEligibility), not the windowed cooldown/eligibility
  // mechanism every other row here uses — excluded from the generic
  // `modes` list entirely and surfaced via its own `kolBonus` field
  // instead, since the Play page renders it as a bespoke card, not a
  // ModeCard.
  const kolBonus = await checkKolBonusEligibility(session.walletProfileId);

  const rows = await Promise.all(
    configs
      .filter((cfg) => cfg.mode !== GameMode.KOL_REFERRAL_BONUS)
      .map(async (cfg) => {
        const isGated = cfg.eligibilityWindowHours !== null && cfg.eligibilityMinPlays !== null;
        const eligibility = isGated ? await checkPromoEligibility(session.walletProfileId, cfg) : null;
        if (isGated && !eligibility!.eligible) {
          return { cfg, include: false, eligibility, cooldown: null };
        }
        // Only checked once eligibility already passed (or isn't gated at
        // all) — a wallet that doesn't qualify yet is omitted entirely
        // (see isGated above), never shown as "played" instead.
        const cooldown = await checkModeCooldown(session.walletProfileId, cfg.mode, cfg);
        return { cfg, include: true, eligibility, cooldown };
      })
  );

  return NextResponse.json({
    modes: rows
      .filter((r) => r.include)
      .map(({ cfg, eligibility, cooldown }) => ({
        mode: cfg.mode,
        label: cfg.label,
        description: cfg.description,
        entryFeeUsdt: Number(cfg.entryFeeUsdt),
        durationSec: cfg.durationSec,
        prefundedPoolUsdt: cfg.prefundedPoolUsdt !== null ? Number(cfg.prefundedPoolUsdt) : null,
        badge:
          cfg.prefundedPoolUsdt !== null
            ? "Free ticket"
            : Number(cfg.entryFeeUsdt) > 0
              ? `${Number(cfg.entryFeeUsdt)} USDT`
              : "Free",
        eligibility,
        cooldown,
      })),
    kolBonus: kolBonus.eligible
      ? { eligible: true, playsRemaining: kolBonus.playsRemaining, ptsCapRemaining: kolBonus.ptsCapRemaining }
      : { eligible: false, playsRemaining: 0, ptsCapRemaining: 0 },
  });
}
