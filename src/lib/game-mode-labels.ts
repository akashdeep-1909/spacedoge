import type { TranslationKey } from "@/lib/i18n/LocaleProvider";

// GameModeConfig (src/lib/gameModes.ts) is DB-backed and admin-editable
// via /admin/settings — its `label`/`description` columns hold exactly
// ONE language's text each, no per-locale variants. Every API response
// that carries a mode's display copy (GET /api/game-modes, /api/matches
// /active, /api/matches/[id]/results & /settle, /api/lobbies/*,
// /api/invitations, /api/invite-links/[token]) returns that single raw
// string — so a non-English viewer saw "Rookie Rush" / "A 60-second
// round with a light hazard field..." in plain English everywhere: the
// Play page's mode cards, the in-match HUD title, match results, lobby
// summaries, and invitation banners. Confirmed live via screenshot:
// "see the text are not properly translated" (Vietnamese locale, Play
// page mode list).
//
// Static translation keys (src/lib/i18n/translations/*.ts's `gameModes`
// section) cover the 9 built-in modes, keyed by the `GameMode` enum
// value every one of those API responses already includes alongside
// the raw label/description (as `mode`). These helpers prefer that
// translation when the mode is recognized, and fall back to whatever
// raw string the caller passed in otherwise — covering both a future
// mode this file doesn't know about yet, AND an admin who's actually
// customized a row's wording (that customization only ever shows in
// English, same as before this existed, rather than being silently
// discarded in favor of stale seed text).
const LABEL_KEY: Partial<Record<string, TranslationKey>> = {
  PRACTICE: "gameModes.practiceLabel",
  QUICK_RUSH: "gameModes.quickRushLabel",
  EXPLORER_RUSH: "gameModes.explorerRushLabel",
  PRO_RUSH: "gameModes.proRushLabel",
  ELITE_RUSH: "gameModes.eliteRushLabel",
  CHAMPION_RUSH: "gameModes.championRushLabel",
  SPONSORED_DROP: "gameModes.sponsoredDropLabel",
  FORGE_CUP: "gameModes.forgeCupLabel",
  KOL_REFERRAL_BONUS: "gameModes.kolReferralBonusLabel",
};

const DESCRIPTION_KEY: Partial<Record<string, TranslationKey>> = {
  PRACTICE: "gameModes.practiceDescription",
  QUICK_RUSH: "gameModes.quickRushDescription",
  EXPLORER_RUSH: "gameModes.explorerRushDescription",
  PRO_RUSH: "gameModes.proRushDescription",
  ELITE_RUSH: "gameModes.eliteRushDescription",
  CHAMPION_RUSH: "gameModes.championRushDescription",
  SPONSORED_DROP: "gameModes.sponsoredDropDescription",
  FORGE_CUP: "gameModes.forgeCupDescription",
  KOL_REFERRAL_BONUS: "gameModes.kolReferralBonusDescription",
};

export function gameModeLabel(t: (key: TranslationKey) => string, mode: string, fallback: string): string {
  const key = LABEL_KEY[mode];
  return key ? t(key) : fallback;
}

export function gameModeDescription(t: (key: TranslationKey) => string, mode: string, fallback: string): string {
  const key = DESCRIPTION_KEY[mode];
  return key ? t(key) : fallback;
}
