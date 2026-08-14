"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { OnboardingGate } from "@/components/OnboardingGate";
import { useAuth } from "@/lib/auth-context";
import { CoinRushArena } from "@/components/game/CoinRushArena";
import {
  useCreateLobby,
  useMyInvitations,
  useAcceptInvitation,
  useDeclineInvitation,
  useGameModes,
  useActiveMatch,
  type GameModeRow,
} from "@/lib/hooks";
import { GameModeIcon, type GameModeIconKey } from "@/components/icons/GameModeIcons";
import { NotificationsPrompt } from "@/components/NotificationsPrompt";
import { THEME_BY_MODE } from "@/lib/game-config";
import { MatchResultReveal, type MatchParticipantResult, type MatchPoolSummary } from "@/components/game/MatchResultReveal";
import { useLocale } from "@/lib/i18n/LocaleProvider";

type ModeKey =
  | "PRACTICE"
  | "QUICK_RUSH"
  | "EXPLORER_RUSH"
  | "PRO_RUSH"
  | "ELITE_RUSH"
  | "CHAMPION_RUSH"
  | "SPONSORED_DROP"
  | "FORGE_CUP"
  | "KOL_REFERRAL_BONUS";

interface MatchInit {
  matchId: string;
  mapSeed: string;
  mode: ModeKey;
  modeLabel: string;
  durationSec: number;
  entryFeeUsdt: number;
  prizePoolUsdt: number;
  players: number;
  startElapsedSec?: number;
}

interface SettleResult {
  mode: ModeKey;
  rank: number;
  score: number;
  rewardUsdt: number;
  bonusPts: number;
  blockedReason: string | null;
  isPractice: boolean;
  modeLabel: string;
  participants: MatchParticipantResult[];
  pool: MatchPoolSummary;
  kolBonus?: { playsUsed: number; playsRemaining: number; ptsCapRemaining: number } | null;
}

// Icon selection stays a client-side display concern, not admin-
// configurable — every other parameter (label, description, fee,
// duration, enabled, promo pool/cooldown/eligibility) now comes live
// from GET /api/game-modes (src/app/api/game-modes/route.ts), backed
// by the admin-editable GameModeConfig table (src/lib/gameModes.ts).
const MODE_ICON: Record<ModeKey, GameModeIconKey> = {
  PRACTICE: "compass",
  QUICK_RUSH: "bolt",
  EXPLORER_RUSH: "rocket",
  PRO_RUSH: "gem",
  ELITE_RUSH: "star",
  CHAMPION_RUSH: "crown",
  SPONSORED_DROP: "gift",
  FORGE_CUP: "trophy",
  KOL_REFERRAL_BONUS: "gift",
};

// Which section of the page each mode renders in — a display-grouping
// concern, not something an admin needs to reassign; enabled/disabled
// (from the fetched row) is what actually controls visibility.
const FREE_MODES: ModeKey[] = ["PRACTICE"];
const STAKES_MODES: ModeKey[] = ["QUICK_RUSH", "EXPLORER_RUSH", "PRO_RUSH", "ELITE_RUSH", "CHAMPION_RUSH"];
const PROMO_MODES: ModeKey[] = ["SPONSORED_DROP", "FORGE_CUP"];
const RECOMMENDED_MODE: ModeKey = "QUICK_RUSH";

export default function PlayPage() {
  return (
    <OnboardingGate>
      <PlayFlow />
    </OnboardingGate>
  );
}

function PlayFlow() {
  const { t } = useLocale();
  const [match, setMatch] = useState<MatchInit | null>(null);
  const [result, setResult] = useState<SettleResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<ModeKey | null>(null);
  const [creatingLobby, setCreatingLobby] = useState<ModeKey | null>(null);
  const queryClient = useQueryClient();
  const { address } = useAccount();
  const { session } = useAuth();
  const router = useRouter();
  const createLobby = useCreateLobby();
  const { data: modesData, isLoading: modesLoading } = useGameModes();
  const { data: activeMatch } = useActiveMatch();

  function resumeMatch() {
    if (activeMatch?.type !== "match") return;
    const startedAtMs = new Date(activeMatch.startedAt).getTime();
    const startElapsedSec = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
    setMatch({
      matchId: activeMatch.matchId,
      mapSeed: activeMatch.mapSeed,
      mode: activeMatch.mode as ModeKey,
      modeLabel: activeMatch.modeLabel,
      durationSec: activeMatch.durationSec,
      entryFeeUsdt: 0,
      prizePoolUsdt: activeMatch.prizePoolUsdt,
      players: activeMatch.players,
      startElapsedSec,
    });
    setResult(null);
  }

  const modesByKey = new Map((modesData?.modes ?? []).map((m) => [m.mode as ModeKey, m]));
  const freeModes = FREE_MODES.filter((m) => modesByKey.has(m));
  const stakesModes = STAKES_MODES.filter((m) => modesByKey.has(m));
  const promoModes = PROMO_MODES.filter((m) => modesByKey.has(m));
  const kolBonus = modesData?.kolBonus;

  async function startMatch(mode: ModeKey) {
    const row = modesByKey.get(mode);
    setError(null);
    setStarting(mode);
    try {
      const res = await fetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not start match.");
      const modeLabel = row?.label ?? (mode === "KOL_REFERRAL_BONUS" ? t("play.kolBonusCardLabel") : body.mode);
      setMatch({ ...body, modeLabel });
      setResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start match.");
    } finally {
      setStarting(null);
    }
  }

  async function startFriendsLobby(mode: ModeKey) {
    const row = modesByKey.get(mode);
    if (!row) return;
    setError(null);
    setCreatingLobby(mode);
    try {
      const lobby = await createLobby.mutateAsync(row.entryFeeUsdt);
      router.push(`/dashboard/play/lobby/${lobby.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create lobby.");
    } finally {
      setCreatingLobby(null);
    }
  }

  async function handleComplete(payload: { score: number; durationPlayedSec: number }) {
    if (!match) return;
    const res = await fetch(`/api/matches/${match.matchId}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    setResult({ ...body, modeLabel: match.modeLabel });
    setMatch(null);
    queryClient.invalidateQueries({ queryKey: ["balances"] });
    queryClient.invalidateQueries({ queryKey: ["active-match"] });
  }

  // Quitting reports a 0 score immediately, settling the match as a
  // loss right away — without this, closing/navigating away mid-round
  // left the match stuck IN_MATCH with no way to end it, blocking any
  // later "already in another active lobby or match" check for as long
  // as that staleness grace period lasted. Reusing the same /settle
  // call handleComplete already makes, just with a 0 payload — never
  // eligible for a reward either way, so there's nothing to game here.
  async function quitMatch() {
    if (!match) return;
    await handleComplete({ score: 0, durationPlayedSec: 0 });
  }

  if (match) {
    // Full-viewport overlay while a match is live — escapes the dashboard
    // header/nav/footer chrome the same way the original prototype ran
    // as a near-fullscreen "phone" frame, so the arena gets real screen
    // real estate instead of a small embedded card.
    const matchTheme = THEME_BY_MODE[match.mode] ?? THEME_BY_MODE.EXPLORER_RUSH;
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-2.5"
        style={{
          background: `radial-gradient(circle at 12% 0%, ${matchTheme.modalGlow}, transparent 30%), radial-gradient(circle at 88% 8%, rgba(33,220,255,.18), transparent 34%), radial-gradient(circle at 45% 100%, rgba(255,209,102,.1), transparent 35%), linear-gradient(180deg,#020811,#09101d 62%,#020811)`,
        }}
      >
        <div className="relative h-[min(930px,calc(100vh-20px))] w-[min(450px,calc(100vw-20px))] overflow-hidden rounded-[36px] border border-white/15 bg-[#06101a] shadow-2xl">
          <button
            onClick={quitMatch}
            className="absolute right-3 top-3 z-10 rounded-full border border-white/20 bg-black/50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white/70 backdrop-blur transition hover:border-risk/40 hover:text-risk"
          >
            ✕ {t("play.quitButton")}
          </button>
          <CoinRushArena
            mapSeed={match.mapSeed}
            durationSec={match.durationSec}
            startElapsedSec={match.startElapsedSec}
            onComplete={handleComplete}
            fullscreen
            missionTitle={match.modeLabel}
            prizePoolUsdt={match.prizePoolUsdt}
            walletAddress={address}
            nickname={session?.nickname}
            mode={match.mode}
          />
        </div>
      </div>
    );
  }

  if (result) {
    // Practice is free (no reward pool, XP only) — the animated
    // reward-box reveal exists to celebrate a real PTS bonus, so it
    // stays out of this path entirely; Practice keeps the plain
    // rank/score summary it always had.
    if (result.isPractice) {
      return (
        <div className="game-panel hud-corner glow-gold mx-auto max-w-sm rounded-2xl p-6 text-center">
          <span
            className="inline-block rounded-full border border-gold/30 bg-gold-soft px-3 py-1 text-xs font-black uppercase tracking-wide text-gold"
            style={{ animation: "pulse-glow 2s ease-in-out infinite" }}
          >
            {t("play.xpEarnedBadge")}
          </span>
          <h2 className="text-glow-gold mt-3 text-3xl font-black">{t("play.practiceCompleteTitle")}</h2>
          <div className="mt-4 grid grid-cols-2 gap-2 text-left">
            <div className="rounded-xl border border-line bg-panel-2 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{t("play.rankLabel")}</p>
              <p className="stat-value text-lg">#{result.rank}</p>
            </div>
            <div className="rounded-xl border border-line bg-panel-2 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{t("play.scoreLabel")}</p>
              <p className="stat-value text-lg">{result.score}</p>
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <button
              onClick={() => setResult(null)}
              className="btn-game hud-corner flex-1 rounded-full px-4 py-2 text-sm"
            >
              {t("play.playAgainButton")}
            </button>
            <Link
              href="/dashboard"
              className="btn-game-outline flex-1 rounded-full px-4 py-2 text-center text-sm"
            >
              {t("play.dashboardButton")}
            </Link>
          </div>
        </div>
      );
    }
    // KOL referral gift: the human always ranks last (rankKolBonusMatch
    // guarantees every bot outscores them), yet still earns a real,
    // if capped, reward — MatchResultReveal's reveal animation is keyed
    // to ranks 1-3 and would show no reveal at all despite a genuine
    // payout, so this mode gets its own simple summary instead, same
    // shape as the Practice branch above but with the actual
    // PTS/USDT earned and remaining-allowance copy.
    if (result.mode === "KOL_REFERRAL_BONUS") {
      const playsRemaining = result.kolBonus?.playsRemaining ?? 0;
      return (
        <div className="game-panel hud-corner glow-gold mx-auto max-w-sm rounded-2xl p-6 text-center">
          <span
            className="inline-block rounded-full border border-gold/30 bg-gold-soft px-3 py-1 text-xs font-black uppercase tracking-wide text-gold"
            style={{ animation: "pulse-glow 2s ease-in-out infinite" }}
          >
            {t("play.kolBonusEarnedBadge")}
          </span>
          <h2 className="text-glow-gold mt-3 text-3xl font-black">{t("play.kolBonusCompleteTitle")}</h2>
          <p className="mt-2 text-sm text-mint">
            {t("play.kolBonusEarnedBody", { pts: Math.round(result.rewardUsdt * 1000), usdt: result.rewardUsdt.toFixed(2) })}
          </p>
          <p className="mt-1 text-xs text-muted">
            {t("play.kolBonusRemainingBody", {
              playsUsed: result.kolBonus?.playsUsed ?? 0,
              capRemaining: ((result.kolBonus?.ptsCapRemaining ?? 0) / 1000).toFixed(2),
            })}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-left">
            <div className="rounded-xl border border-line bg-panel-2 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{t("play.rankLabel")}</p>
              <p className="stat-value text-lg">#{result.rank}</p>
            </div>
            <div className="rounded-xl border border-line bg-panel-2 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{t("play.scoreLabel")}</p>
              <p className="stat-value text-lg">{result.score}</p>
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            {playsRemaining > 0 && (
              <button
                onClick={() => setResult(null)}
                className="btn-game hud-corner flex-1 rounded-full px-4 py-2 text-sm"
              >
                {t("play.playAgainButton")}
              </button>
            )}
            <Link
              href="/dashboard"
              className={`btn-game-outline rounded-full px-4 py-2 text-center text-sm ${playsRemaining > 0 ? "flex-1" : "w-full"}`}
            >
              {t("play.dashboardButton")}
            </Link>
          </div>
        </div>
      );
    }
    return (
      <MatchResultReveal
        participants={result.participants}
        modeLabel={result.modeLabel}
        onPlayAgain={() => setResult(null)}
        dashboardHref="/dashboard"
      />
    );
  }

  return (
    <div className="mx-auto max-w-md">
      {activeMatch?.type === "match" && (
        <div className="game-panel hud-corner glow-gold mb-5 flex items-center justify-between gap-3 rounded-2xl border-gold/40 p-4">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-gold">{t("play.resumeBannerTitle")}</p>
            <p className="mt-1 text-sm text-muted">{t("play.resumeMatchBody", { mode: activeMatch.modeLabel })}</p>
          </div>
          <button onClick={resumeMatch} className="btn-game hud-corner shrink-0 rounded-full px-4 py-2 text-sm">
            {t("play.resumeButton")}
          </button>
        </div>
      )}
      {activeMatch?.type === "lobby" && (
        <div className="game-panel hud-corner glow-gold mb-5 flex items-center justify-between gap-3 rounded-2xl border-gold/40 p-4">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-gold">{t("play.resumeBannerTitle")}</p>
            <p className="mt-1 text-sm text-muted">{t("play.resumeLobbyBody")}</p>
          </div>
          <Link
            href={`/dashboard/play/lobby/${activeMatch.lobbyId}`}
            className="btn-game hud-corner shrink-0 rounded-full px-4 py-2 text-sm"
          >
            {t("play.resumeLobbyButton")}
          </Link>
        </div>
      )}

      <h2 className="text-glow-gold text-2xl font-black uppercase tracking-wide">{t("play.chooseModeTitle")}</h2>
      <p className="mt-1 text-sm text-muted">
        {t("play.chooseModeSubtitle")}
      </p>

      <NotificationsPrompt />

      <IncomingInvitations onJoined={(lobbyId) => router.push(`/dashboard/play/lobby/${lobbyId}`)} />

      {modesLoading ? (
        <p className="mt-6 text-sm text-muted">{t("play.loadingModes")}</p>
      ) : (
        <>
          {kolBonus?.eligible && (
            <section className="mt-5">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">
                {t("play.kolBonusSectionLabel")}
              </p>
              <div className="game-panel hud-corner glow-gold mt-2 rounded-2xl border-gold/40 p-3.5">
                <div className="flex items-center gap-3">
                  <GameModeIcon icon="gift" accentColor={THEME_BY_MODE.KOL_REFERRAL_BONUS.accent} />
                  <div>
                    <p className="font-bold">{t("play.kolBonusCardLabel")}</p>
                    <p className="text-xs text-muted">
                      {t("play.kolBonusCardBody", {
                        playsRemaining: kolBonus.playsRemaining,
                        capRemaining: (kolBonus.ptsCapRemaining / 1000).toFixed(2),
                      })}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => startMatch("KOL_REFERRAL_BONUS")}
                  disabled={starting !== null}
                  className="btn-game hud-corner mt-3 w-full rounded-full px-3 py-1.5 text-xs disabled:opacity-50"
                >
                  {starting === "KOL_REFERRAL_BONUS" ? t("play.startingButton") : `▶ ${t("play.playButton")}`}
                </button>
              </div>
            </section>
          )}

          {freeModes.length > 0 && (
            <section className="mt-5">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">{t("play.freeSectionLabel")}</p>
              <div className="mt-2 flex flex-col gap-2">
                {freeModes.map((mode) => (
                  <ModeCard key={mode} row={modesByKey.get(mode)!} starting={starting} onSelect={startMatch} />
                ))}
              </div>
            </section>
          )}

          {stakesModes.length > 0 && (
            <section className="mt-5">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">{t("play.stakesSectionLabel")}</p>
              <div className="mt-5 flex flex-col gap-2">
                {stakesModes.map((mode) => (
                  <ModeCard
                    key={mode}
                    row={modesByKey.get(mode)!}
                    starting={starting}
                    onSelect={startMatch}
                    recommended={mode === RECOMMENDED_MODE}
                    onPlayWithFriends={startFriendsLobby}
                    creatingLobby={creatingLobby}
                  />
                ))}
              </div>
            </section>
          )}

          {promoModes.length > 0 && (
            <section className="mt-5">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">{t("play.promoSectionLabel")}</p>
              <div className="mt-2 flex flex-col gap-2">
                {promoModes.map((mode) => (
                  <ModeCard key={mode} row={modesByKey.get(mode)!} starting={starting} onSelect={startMatch} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {error && <ErrorNotice message={error} onClose={() => setError(null)} />}
    </div>
  );
}

// Spec: an insufficient-balance rejection should offer a direct path to
// fund the wallet, not just a dead-end error string. Detected by the
// exact phrase src/lib/lobby.ts's checkPaidEligibility() always uses
// for a 402 — every "not enough Deposit USDT" message across
// create-lobby, join, and accept-invite all share this wording.
//
// A centered popup, not an inline banner appended after the (long, on
// mobile scroll-past-the-fold) mode list — the inline version landed
// below every mode card, so a "no balance" rejection on a phone was
// invisible unless the player happened to scroll all the way down.
function ErrorNotice({ message, onClose }: { message: string; onClose: () => void }) {
  const { t } = useLocale();
  const isBalanceError = message.includes("Deposit USDT");

  useEffect(() => {
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [onClose]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-4 top-1/2 z-50 -translate-y-1/2 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-sm sm:-translate-x-1/2">
        <div className="game-panel hud-corner relative rounded-2xl border-risk/25 p-5 text-center">
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 text-muted transition hover:text-foreground"
          >
            ✕
          </button>
          <p className="mt-2 text-sm text-risk">{message}</p>
          {isBalanceError ? (
            <Link
              href="/dashboard/deposit"
              className="btn-game hud-corner mt-4 inline-block rounded-full px-5 py-2 text-sm"
            >
              {t("play.depositUsdtButton")}
            </Link>
          ) : (
            <button onClick={onClose} className="btn-game-outline mt-4 rounded-full px-5 py-2 text-sm">
              Close
            </button>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}

function ModeCard({
  row,
  starting,
  onSelect,
  recommended,
  onPlayWithFriends,
  creatingLobby,
}: {
  row: GameModeRow;
  starting: ModeKey | null;
  onSelect: (mode: ModeKey) => void;
  recommended?: boolean;
  onPlayWithFriends?: (mode: ModeKey) => void;
  creatingLobby?: ModeKey | null;
}) {
  const { t } = useLocale();
  const mode = row.mode as ModeKey;
  const busy = starting !== null || (creatingLobby !== null && creatingLobby !== undefined);
  // Free-ticket promo modes (Sponsored Drop/Weekly Forge Cup) reject a
  // re-entry within their cooldown window server-side — surfacing that
  // here upfront as a disabled "Played" button beats letting the wallet
  // tap Play and only find out from an error popup.
  const onCooldown = row.cooldown?.onCooldown ?? false;
  const theme = THEME_BY_MODE[mode];
  return (
    <div className={recommended ? "pt-2.5" : undefined}>
      {recommended && (
        // Sibling of the hud-corner card, not a child positioned outside
        // its bounds — hud-corner's clip-path polygon clips to the
        // element's own box, so a negatively-offset absolute child (the
        // old approach) got sliced by that clip, especially right at the
        // top-left corner notch where this badge sits.
        <span className="relative z-10 -mb-2.5 ml-3.5 inline-block rounded-full border border-gold/40 bg-gold-soft px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-gold">
          {t("play.startHereBadge")}
        </span>
      )}
      <div
        className={`game-panel hud-corner relative rounded-2xl p-3.5 transition ${
          recommended ? "glow-gold border-gold/40" : ""
        }`}
      >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <GameModeIcon icon={MODE_ICON[mode]} accentColor={theme.accent} />
          <div>
            <p className="font-bold">{row.label}</p>
            <p className="text-xs text-muted">{row.description}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-panel-2 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-gold">
          {row.badge}
        </span>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onSelect(mode)}
          disabled={busy || onCooldown}
          className={`btn-game hud-corner rounded-full px-3 py-1.5 text-xs disabled:opacity-50 ${
            onPlayWithFriends ? "flex-1" : "w-full"
          }`}
        >
          {onCooldown
            ? `✓ ${t("play.playedButton")}`
            : starting === mode
              ? t("play.startingButton")
              : `▶ ${t("play.playButton")}`}
        </button>
        {onPlayWithFriends && (
          <button
            onClick={() => onPlayWithFriends(mode)}
            disabled={busy}
            className="btn-game-outline flex-1 rounded-full px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {creatingLobby === mode ? t("play.creatingButton") : `👥 ${t("play.withFriendsButton")}`}
          </button>
        )}
      </div>
      </div>
    </div>
  );
}

// Incoming "Play with Friends" invitations — polled (this app has no
// push infra, see src/lib/lobby.ts), rendered as a compact banner right
// above the mode list rather than a separate page, since a fresh
// invitation is exactly the kind of thing you want to act on before
// picking a different mode by accident.
function IncomingInvitations({ onJoined }: { onJoined: (lobbyId: string) => void }) {
  const { t } = useLocale();
  const { data } = useMyInvitations();
  const accept = useAcceptInvitation();
  const decline = useDeclineInvitation();
  const [error, setError] = useState<string | null>(null);

  const pending = data?.incoming.filter((inv) => inv.status === "PENDING") ?? [];
  if (pending.length === 0) return null;

  return (
    <div className="mt-4 flex flex-col gap-2">
      {pending.map((inv) => {
        const shortAddress = `${inv.otherAddress.slice(0, 6)}…${inv.otherAddress.slice(-4)}`;
        return (
        <div key={inv.id} className="game-panel hud-corner glow-gold rounded-2xl border-gold/40 p-3.5 text-sm">
          <p>
            <span className="font-bold">{shortAddress}</span>{" "}
            {t("play.invitationText", { fee: inv.entryFeeUsdt, mode: inv.modeLabel })}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={async () => {
                setError(null);
                try {
                  const lobby = await accept.mutateAsync(inv.id);
                  onJoined(lobby.id);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Failed to accept invitation");
                }
              }}
              className="btn-game hud-corner flex-1 rounded-full px-3 py-1.5 text-xs"
            >
              {t("play.acceptAndJoinButton")}
            </button>
            <button
              onClick={() => decline.mutate(inv.id)}
              className="btn-game-outline flex-1 rounded-full px-3 py-1.5 text-xs"
            >
              {t("play.declineButton")}
            </button>
          </div>
        </div>
        );
      })}
      {error && <ErrorNotice message={error} onClose={() => setError(null)} />}
    </div>
  );
}
