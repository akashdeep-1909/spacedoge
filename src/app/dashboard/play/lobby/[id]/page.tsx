"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { OnboardingGate } from "@/components/OnboardingGate";
import { useAuth } from "@/lib/auth-context";
import { CoinRushArena } from "@/components/game/CoinRushArena";
import { QuitMatchButton } from "@/components/game/QuitMatchButton";
import { copyToClipboard } from "@/lib/clipboard";
import { getPublicOrigin } from "@/lib/publicUrl";
import { NotificationsPrompt } from "@/components/NotificationsPrompt";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { THEME_BY_MODE, RENTAL_BOT_MIN_HUMANS, LOBBY_MIN_HUMANS_TO_START } from "@/lib/game-config";
import type { GameMode } from "@/generated/prisma/enums";
import { MatchResultReveal, type MatchParticipantResult, type MatchPoolSummary } from "@/components/game/MatchResultReveal";
import { gameModeLabel } from "@/lib/game-mode-labels";
import {
  useLobby,
  useInviteToLobby,
  useStartLobby,
  useCancelLobby,
  useLeaveLobby,
  useGenerateInviteLink,
  useDisableInviteLink,
  useSubmitMatchResults,
  useRecentPlayers,
  useMatchRoster,
  useLiveMatchState,
  useAcceptInvitation,
  useDeclineInvitation,
  usePatchLobbyLoadout,
  usePatchLobbyRentalBot,
} from "@/lib/hooks";
import { RentalBotPanel } from "@/components/game/RentalBotPanel";
import { LobbyLoadoutPanel } from "@/components/game/LobbyLoadoutPanel";
import { PreJoinLoadoutPicker, type PreJoinSelections } from "@/components/game/PreJoinLoadoutPicker";
import type { ShopItemCategory } from "@/lib/shop-shared";

function displayName(address: string, nickname?: string | null) {
  return nickname || `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// Same resume-in-progress math as the instant-play page's
// resumeMatch() (src/app/dashboard/play/page.tsx) — how far into the
// match the server-authoritative clock already is, as of right now.
// Pulled out to a plain module-level function (not inlined in the
// component) since it reads the real clock and the lobby page has no
// user-initiated click to hang that read off of.
function elapsedSecondsSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
}

export default function LobbyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <OnboardingGate>
      <LobbyFlow lobbyId={id} />
    </OnboardingGate>
  );
}

function LobbyFlow({ lobbyId }: { lobbyId: string }) {
  const { data: lobby, isLoading, error: loadError } = useLobby(lobbyId);
  const { address } = useAccount();
  const { session } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Present only via the "Accept and Join" navigation for a direct
  // invite (see IncomingInvitations/IncomingInviteToast) — everyone
  // else (host, invite-link join, room-code join) reaches this page
  // with no query string at all, and falls straight through to the
  // already-joined gated screen below exactly as before.
  const invitationId = searchParams.get("invitationId");
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const submitResults = useSubmitMatchResults();
  const acceptInvitation = useAcceptInvitation();
  const declineInvitation = useDeclineInvitation();
  const patchLoadout = usePatchLobbyLoadout(lobbyId);
  const patchRentalBot = usePatchLobbyRentalBot(lobbyId);

  const [inviteAddress, setInviteAddress] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [origin] = useState(() => getPublicOrigin());
  // Blocks the rest of this waiting room from rendering at all — see
  // the early-return render guard below — until "I'm Ready" is
  // clicked. Confirmed live as a real ask: this used to be a
  // dismissible overlay ON TOP of the already-visible waiting room, so
  // accepting an invite and landing here showed the room (and every
  // other joined player) before you'd picked a loadout at all; now the
  // loadout screen is the only thing rendered until you confirm, so
  // "joining the room" (seeing/being seen by everyone else there) only
  // visibly happens after you're actually ready — closer to solo/
  // instant play's own pre-match LoadoutSelectModal, which the player
  // has to dismiss before the match can start at all. This still can't
  // force the HOST to wait for anyone else, and it's a client-side
  // gate only — server-side, accepting the invite already made this
  // wallet a real JOINED participant the moment "Accept and Join" was
  // clicked (unchanged), so the two panels below remain the single
  // place a loadout is ever actually recorded, whether shown here
  // first or on the normal waiting-room view reached afterward.
  // Selections save instantly per click either way (see those panels'
  // own PATCH-per-click design) — this screen doesn't add a second,
  // separate "confirm" step on top of that, it's purely about when the
  // rest of the room becomes visible.
  const [showLoadoutIntro, setShowLoadoutIntro] = useState(true);
  // Local-only picks for the not-yet-joined pre-join screen (see
  // PreJoinLoadoutPicker) — there's no lobby membership yet to save
  // these against, so they live here until handleAcceptAndReady
  // applies them right after the real accept-invitation call succeeds.
  const [preJoinSelections, setPreJoinSelections] = useState<PreJoinSelections>({ loadout: {}, rentalBotItemId: null });
  const [preJoinError, setPreJoinError] = useState<string | null>(null);
  const [joiningFromInvite, setJoiningFromInvite] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<{
    rank: number | null;
    score: number;
    rewardUsdt: number;
    blockedReason: string | null;
    participants: MatchParticipantResult[];
    pool: MatchPoolSummary;
  } | null>(null);
  const [waitingForOthers, setWaitingForOthers] = useState<{ submitted: number; total: number } | null>(null);
  // Set once (never back to false — a dead ship stays dead for the
  // rest of this match) whenever this wallet's own run ended because
  // it ran out of lives, whether the real mission clock had already
  // hit 0 too (allShipsDown) or the match kept going for other real
  // racers after that. Confirmed live as a real UX bug: watching the
  // others finish live (the waitingForOthers render below, normally)
  // only ever shows a dead player their own ship sitting parked at 0
  // lives while everyone else moves around it — not actually useful,
  // and reading as the match having restarted right after it claimed
  // to be over. A player who died gets a plain "waiting" screen
  // instead (see the waitingForOthers render below); a player who
  // survived to a genuine full-duration finish still gets to watch.
  const [ranOutOfLives, setRanOutOfLives] = useState(false);

  const invite = useInviteToLobby(lobbyId);
  const start = useStartLobby(lobbyId);
  const cancel = useCancelLobby(lobbyId);
  const leave = useLeaveLobby(lobbyId);
  const generateLink = useGenerateInviteLink(lobbyId);
  const disableLink = useDisableInviteLink(lobbyId);
  const { data: recentPlayersData } = useRecentPlayers();
  const { data: rosterData, error: rosterError } = useMatchRoster(lobby?.finalMatchId ?? null);
  // CoinRushArena's setup effect depends on loadout.rentalBot (and the
  // other loadout fields) treating them as fixed-at-mount — mounting
  // the arena before this roster fetch resolves let `loadout` flip from
  // undefined to its real value AFTER the match had already been
  // running, which tore down and rebuilt the entire live match mid-play
  // (see that effect's own doc-comment) and, worse, left "you" undriven
  // (isYou-with-no-rentalBot falls into the human-input branch, which
  // does nothing without a human touching the screen) for however long
  // that gap lasted. Gating showGame on the roster having settled one
  // way or the other closes that gap — this fetch is effectively
  // instant once finalMatchId exists, so the loading beat below is
  // barely visible. A hard fetch failure is treated as "settled with no
  // loadout" rather than stranding the player on a loading screen
  // forever — same graceful-degradation stance as an invalid/expired
  // loadout selection elsewhere in this feature.
  const rosterSettled = !!rosterData || !!rosterError;

  // Derived, not synced via an effect: the arena shows exactly while
  // the match is live, this client hasn't submitted its own result yet,
  // and no result (or wait state) has landed.
  const showGame = lobby?.status === "STARTED" && !!lobby.finalMatchId && rosterSettled && !submitted && !result && !waitingForOthers;
  // Polled during BOTH active play (showGame) and the post-finish
  // spectate screen (waitingForOthers), not just the latter — this app
  // has no push infra, so "see every other real player's actual
  // position/shield/fire in real time" comes from a dedicated,
  // deliberately faster polling tier scoped away from the rest of the
  // app's normal-cadence traffic. See useLiveMatchState's own
  // doc-comment. Confirmed wanted live: two real friends actively
  // racing each other could only ever see a local bot-AI guess of what
  // the other was doing — never their actual moves or shield/fire —
  // until whoever finished first switched to spectating; this closes
  // that gap for the entire match, not just the tail end of it. Off
  // for a player who already died (ranOutOfLives) once they're off the
  // showGame/waitingForOthers path entirely (see that state's own
  // doc-comment) — the plain waiting card they land on has nothing to
  // do with this data.
  const { data: liveState } = useLiveMatchState(lobby?.finalMatchId ?? null, {
    enabled: (showGame || !!waitingForOthers) && !ranOutOfLives,
  });
  const lastScore = useRef({ score: 0, durationPlayedSec: 0 });

  // Shared by both the live-play render (showGame) and the post-finish
  // spectate render (waitingForOthers) below — real identity + real
  // slotNumber for the other 3 seats, ordered to match CoinRushArena's
  // ship slots. slotNumber is what spectate mode needs to key into
  // liveState.slots; showGame's own render never reads it.
  //
  // Memoized on rosterData itself (not recomputed into a fresh array/
  // object literal every render) — CoinRushArena's own setup effect
  // depends on this value, so a new reference here on every render (the
  // filter/sort/map chain below always returns new objects, regardless
  // of whether the underlying data actually changed) re-triggers that
  // effect, which tears down and rebuilds the entire running match:
  // ships reset to spawn, hazards/coins reshuffle, the "3, 2, 1, Go"
  // countdown replays — reading exactly like the game randomly
  // restarting mid-play. rosterData itself is stable (useMatchRoster
  // has staleTime: Infinity, fetched once per match and never
  // refetched), so this now only ever recomputes when the roster
  // actually changes — i.e. essentially once, on load. Same reasoning
  // startElapsedSec below already documents for the identical failure
  // mode.
  const opponents = useMemo(
    () =>
      rosterData?.seats
        .filter((s) => !s.isYou)
        .sort((a, b) => (a.slotNumber ?? 0) - (b.slotNumber ?? 0))
        .map((s) => ({ isBot: s.isBot, label: s.label, slotNumber: s.slotNumber, shapeKey: s.shapeKey, colorHex: s.colorHex })),
    [rosterData]
  );

  // Memoized (not recomputed every render) on finalMatchId/startedAt —
  // CoinRushArena's own setup effect depends on this value, so
  // recomputing it on every poll tick would re-initialize the whole
  // game repeatedly. Without this, loading or reloading this page
  // anytime after the real lobby.startedAt (a slow initial load, a
  // backgrounded tab, a refresh) starts the mission clock fresh at the
  // full duration instead of wherever the server-authoritative match
  // actually is.
  //
  // !!waitingForOthers is deliberately also a dependency — confirmed
  // live as the actual cause of "game stuck in the center, need
  // refresh": CoinRushArena's setup effect ALSO depends on `spectate`
  // (it has to — "you" starts inactive and real opponents switch to
  // externally-driven only in spectate mode), so finishing your own run
  // and dropping into the waitingForOthers/spectate view re-runs that
  // whole setup effect on the very same mounted instance, which
  // recomputes `time` as `durationSec - startElapsedSec`. Without this
  // dependency, that recompute reused the value snapshotted once way
  // back near this page's initial load — by the time you actually
  // finish a run, real elapsed time has moved on far past that stale
  // snapshot, so the spectate view's mission clock visibly JUMPS
  // BACKWARD to near-full duration instead of picking up near where the
  // match actually is, and everyone's ships/hazards/coins reset to
  // spawn along with it — reading exactly like the game randomly
  // freezing/restarting. Adding it forces one fresh, correct resnapshot
  // exactly at that transition (and only then — waitingForOthers only
  // flips once per run, so this doesn't reintroduce the mid-play
  // thrashing this memo exists to prevent).
  const isWaitingForOthers = !!waitingForOthers;
  const startElapsedSec = useMemo(
    () => (lobby?.finalMatchId && lobby.startedAt ? elapsedSecondsSince(lobby.startedAt) : 0),
    // isWaitingForOthers isn't read by the body above — it's here purely
    // to force exactly one resnapshot at the play→spectate transition,
    // per the doc-comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lobby, isWaitingForOthers]
  );

  // Once results settle for everyone (or we're still waiting), poll the
  // results endpoint by re-submitting our own stored score every few
  // seconds — this app has no push infra, see src/lib/lobby.ts.
  useEffect(() => {
    if (!waitingForOthers || !lobby?.finalMatchId) return;
    const matchId = lobby.finalMatchId;
    const t = setInterval(async () => {
      const res = await submitResults.mutateAsync({ matchId, ...lastScore.current });
      if (res.status === "settled") {
        setResult({
          rank: res.rank,
          score: res.score,
          rewardUsdt: res.rewardUsdt,
          blockedReason: res.blockedReason,
          participants: res.participants,
          pool: res.pool,
        });
        setWaitingForOthers(null);
        queryClient.invalidateQueries({ queryKey: ["balances"] });
      } else {
        setWaitingForOthers({ submitted: res.submitted, total: res.total });
      }
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingForOthers, lobby?.finalMatchId]);

  // A player who died early gets the plain waiting card (see
  // ranOutOfLives above), which has no mission clock of its own to
  // notice the real match ending — without this, they'd sit on
  // "waiting for other racers" right through the actual end and
  // straight into Match Results with no "Time's Up" beat at all,
  // which a player who survived to the real end still gets (via
  // CoinRushArena's own overlay). Confirmed wanted live: watching two
  // real players finish the same match, the one who died early is
  // still expected to see "Time's Up" once, same as everyone else,
  // just without the live spectate gameplay in between. One-shot timer
  // to the real remaining time (startElapsedSec is a stable snapshot —
  // see its own doc-comment — so this fires once and never re-arms).
  const [realTimeUp, setRealTimeUp] = useState(false);
  useEffect(() => {
    if (!ranOutOfLives || !lobby?.finalMatchId) return;
    const remainingMs = Math.max(0, (lobby.durationSec - startElapsedSec) * 1000);
    const timer = setTimeout(() => setRealTimeUp(true), remainingMs);
    return () => clearTimeout(timer);
  }, [ranOutOfLives, lobby?.finalMatchId, lobby?.durationSec, startElapsedSec]);

  async function handleComplete(payload: { score: number; durationPlayedSec: number; died: boolean }) {
    if (!lobby?.finalMatchId) return;
    lastScore.current = payload;
    if (payload.died) setRanOutOfLives(true);
    setSubmitted(true);
    try {
      const res = await submitResults.mutateAsync({ matchId: lobby.finalMatchId, ...payload });
      if (res.status === "settled") {
        setResult({
          rank: res.rank,
          score: res.score,
          rewardUsdt: res.rewardUsdt,
          blockedReason: res.blockedReason,
          participants: res.participants,
          pool: res.pool,
        });
        queryClient.invalidateQueries({ queryKey: ["balances"] });
      } else {
        setWaitingForOthers({ submitted: res.submitted, total: res.total });
      }
    } catch {
      // A dropped/failed request here used to leave `submitted` true
      // forever with neither waitingForOthers nor result ever set —
      // confirmed live as a real "stuck" case (see the render guard
      // right above this component's showGame branch). lastScore.current
      // already holds this exact payload, and the waitingForOthers poll
      // effect below resubmits it (idempotent past a participant's own
      // first successful submission — see results/route.ts) every 3s
      // regardless of what triggered it, so handing off to that same
      // retry loop here — rather than inventing a second one — is
      // enough to self-heal once the network recovers, instead of
      // needing a manual refresh.
      setWaitingForOthers({ submitted: 0, total: 0 });
    }
  }

  // Same rationale as the instant-play "Quit" button: without this, a
  // human who closes the game before finishing would leave the OTHER
  // participants' /results calls waiting forever (only resolved once
  // the match's resultsDeadlineAt eventually passes). Reporting 0
  // immediately unblocks everyone else and this wallet's own busy-check
  // right away instead of waiting out the grace period.
  async function quitMatch() {
    if (!lobby?.finalMatchId) return;
    // Quitting is functionally the same as dying for the UI below —
    // there's no live run left to watch, so treat it identically (see
    // ranOutOfLives's own doc-comment).
    await handleComplete({ score: 0, durationPlayedSec: 0, died: true });
  }

  async function sendInvite() {
    setInviteError(null);
    try {
      await invite.mutateAsync(inviteAddress.trim());
      setInviteAddress("");
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : t("lobby.failedToSendInvitation"));
    }
  }

  async function quickInvite(playerAddress: string) {
    setInviteError(null);
    try {
      await invite.mutateAsync(playerAddress);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : t("lobby.failedToSendInvitation"));
    }
  }

  async function getOrCreateLink() {
    try {
      const { token } = await generateLink.mutateAsync();
      setInviteLink(`${origin}/play/join/${token}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("lobby.failedToGenerateLink"));
    }
  }

  async function disableLinkNow() {
    await disableLink.mutateAsync();
    setInviteLink(null);
  }

  async function copyLink() {
    if (!inviteLink) return;
    const ok = await copyToClipboard(inviteLink);
    setCopied(ok);
    setTimeout(() => setCopied(false), 2000);
  }

  if (isLoading) return <p className="mx-auto max-w-md text-sm text-muted">{t("lobby.loading")}</p>;
  if (loadError || !lobby) {
    return (
      <div className="mx-auto max-w-md">
        <p className="text-sm text-risk">{loadError instanceof Error ? loadError.message : t("lobby.notFound")}</p>
        <button onClick={() => router.push("/dashboard/play")} className="btn-game-outline mt-3 rounded-full px-4 py-2 text-sm">
          {t("lobby.backToGameModes")}
        </button>
      </div>
    );
  }

  if (lobby.status === "STARTED" && lobby.finalMatchId && !rosterSettled && !submitted && !result && !waitingForOthers) {
    return <p className="mx-auto max-w-md text-sm text-muted">{t("lobby.loading")}</p>;
  }

  // Whether THIS wallet already has a seat in this lobby — the actual
  // gate the pre-join screen below is built around. False for anyone
  // who navigated straight here from "Accept and Join" without the
  // real accept-invitation call having happened yet. Comes straight
  // from the server's own session-based lookup (see LobbyState's own
  // doc-comment) rather than being derived here from wagmi's
  // useAccount().address matched against lobby.slots — confirmed live
  // as a real bug: that comparison could stay false for a beat right
  // after a genuinely successful accept (wagmi's own address state
  // lagging behind, or simply unavailable, independent of whether the
  // SIWE session itself was valid), which kept re-showing this same
  // pre-join screen after "I'm Ready" instead of ever revealing the
  // room, even though the join had actually gone through server-side.
  const amIJoined = lobby.amIJoined;

  // Runs the real join (accept-invitation — the same call "Accept and
  // Join" used to make immediately) only now, at "I'm Ready," then
  // applies whatever was picked on PreJoinLoadoutPicker now that
  // membership actually exists to PATCH those selections against. A
  // since-expired/already-handled invitation surfaces the server's own
  // error message here rather than silently doing nothing.
  async function handleAcceptAndReady() {
    if (!invitationId) { setShowLoadoutIntro(false); return; }
    setPreJoinError(null);
    setJoiningFromInvite(true);
    try {
      await acceptInvitation.mutateAsync(invitationId);
      const entries = Object.entries(preJoinSelections.loadout) as [ShopItemCategory, string | null][];
      for (const [category, walletShopItemId] of entries) {
        await patchLoadout.mutateAsync({ category, walletShopItemId });
      }
      if (preJoinSelections.rentalBotItemId) {
        await patchRentalBot.mutateAsync(preJoinSelections.rentalBotItemId);
      }
      setShowLoadoutIntro(false);
    } catch (err) {
      setPreJoinError(err instanceof Error ? err.message : t("play.failedToAcceptInvitation"));
    } finally {
      setJoiningFromInvite(false);
    }
  }

  if (showGame && lobby.finalMatchId) {
    const lobbyMode = lobby.mode as GameMode;
    const lobbyTheme = THEME_BY_MODE[lobbyMode] ?? THEME_BY_MODE.EXPLORER_RUSH;
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-2.5"
        style={{
          background: `radial-gradient(circle at 12% 0%, ${lobbyTheme.modalGlow}, transparent 30%), radial-gradient(circle at 88% 8%, rgba(33,220,255,.18), transparent 34%), radial-gradient(circle at 45% 100%, rgba(255,209,102,.1), transparent 35%), linear-gradient(180deg,#020811,#09101d 62%,#020811)`,
        }}
      >
        <div className="relative h-[min(930px,calc(100vh-20px))] w-[min(450px,calc(100vw-20px))] overflow-hidden rounded-[36px] border border-white/15 bg-[#06101a] shadow-2xl">
          <QuitMatchButton onQuit={quitMatch} label={t("lobby.quitButton")} confirmLabel={t("lobby.quitConfirmLabel")} />
          <CoinRushArena
            // lobby.mapSeed — the REAL seed the finalized Match's own
            // hazard/item layout AND server-side bot scoring
            // (botScoreForSlot) both key off, never lobby.id. Confirmed
            // live as a serious, long-standing bug: this used to pass
            // lobby.id as a mapSeed stand-in (good enough to make the
            // visual layout look consistent for every viewer, since
            // they'd all get the same wrong seed) — but every bot-score
            // PREDICTION CoinRushArena computes client-side (live
            // pacing, the reward-tier bump math) used a completely
            // different seed than what settle/results routes actually
            // use, so a bot's live number had no real relationship to
            // what it would settle at, in every single "With Friends"
            // match. See serializeLobby's own doc-comment in
            // src/lib/lobby.ts for the full history.
            mapSeed={lobby.mapSeed}
            durationSec={lobby.durationSec}
            startElapsedSec={startElapsedSec}
            onComplete={handleComplete}
            fullscreen
            missionTitle={gameModeLabel(t, lobby.mode, lobby.modeLabel)}
            prizePoolUsdt={lobby.rewardPoolUsdt}
            walletAddress={address}
            nickname={session?.nickname}
            mode={lobbyMode}
            opponents={opponents}
            matchId={lobby.finalMatchId}
            loadout={rosterData?.loadout}
            liveOpponents={liveState?.slots}
          />
        </div>
      </div>
    );
  }

  // handleComplete (below) sets `submitted` synchronously and only
  // learns whether we're waiting on others or already settled once its
  // own await actually resolves — a real network round trip, not
  // instant. Confirmed live as a real bug ("the game ends and suddenly
  // restarts"): every branch below requires waitingForOthers or result
  // to already be set, and the very first `if` above this one
  // explicitly requires `!submitted` — so for however long that one
  // request takes, NOTHING matches and rendering fell all the way
  // through to this component's own default return far below: the
  // pre-match lobby roster/"Starting match…" screen, which looks
  // exactly like the whole match restarting from scratch. This closes
  // that gap with the same spinner the waitingForOthers screen already
  // uses, rather than an unrelated screen from a different phase
  // entirely.
  if (submitted && !waitingForOthers && !result) {
    return (
      <div className="game-panel hud-corner mx-auto max-w-sm rounded-2xl p-6 text-center">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-line border-t-gold" />
        <h2 className="text-glow-gold text-2xl font-black">{t("lobby.waitingHeading")}</h2>
        <p className="mt-2 text-sm text-muted">{t("lobby.waitingBody")}</p>
      </div>
    );
  }

  // Your own run is finished (and you didn't die getting there) —
  // instead of a static "waiting" screen, watch the other real racers'
  // ships live until the match ends (bots keep running their usual
  // local AI; only real opponents are driven by polled live-state —
  // see CoinRushArena's `spectate` mode). A player who ran out of
  // lives (or quit) falls through to the plain waiting card below
  // instead — see ranOutOfLives's own doc-comment for why.
  if (waitingForOthers && lobby.finalMatchId && !ranOutOfLives) {
    const lobbyMode = lobby.mode as GameMode;
    const lobbyTheme = THEME_BY_MODE[lobbyMode] ?? THEME_BY_MODE.EXPLORER_RUSH;
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-2.5"
        style={{
          background: `radial-gradient(circle at 12% 0%, ${lobbyTheme.modalGlow}, transparent 30%), radial-gradient(circle at 88% 8%, rgba(33,220,255,.18), transparent 34%), radial-gradient(circle at 45% 100%, rgba(255,209,102,.1), transparent 35%), linear-gradient(180deg,#020811,#09101d 62%,#020811)`,
        }}
      >
        <div className="relative h-[min(930px,calc(100vh-20px))] w-[min(450px,calc(100vw-20px))] overflow-hidden rounded-[36px] border border-white/15 bg-[#06101a] shadow-2xl">
          <div className="absolute right-3 top-3 z-10 rounded-full border border-white/20 bg-black/60 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white/70 backdrop-blur">
            {t("lobby.spectateBadge", { submitted: waitingForOthers.submitted, total: waitingForOthers.total })}
          </div>
          <CoinRushArena
            // lobby.mapSeed — the REAL seed the finalized Match's own
            // hazard/item layout AND server-side bot scoring
            // (botScoreForSlot) both key off, never lobby.id. Confirmed
            // live as a serious, long-standing bug: this used to pass
            // lobby.id as a mapSeed stand-in (good enough to make the
            // visual layout look consistent for every viewer, since
            // they'd all get the same wrong seed) — but every bot-score
            // PREDICTION CoinRushArena computes client-side (live
            // pacing, the reward-tier bump math) used a completely
            // different seed than what settle/results routes actually
            // use, so a bot's live number had no real relationship to
            // what it would settle at, in every single "With Friends"
            // match. See serializeLobby's own doc-comment in
            // src/lib/lobby.ts for the full history.
            mapSeed={lobby.mapSeed}
            durationSec={lobby.durationSec}
            startElapsedSec={startElapsedSec}
            onComplete={() => {}}
            fullscreen
            missionTitle={gameModeLabel(t, lobby.mode, lobby.modeLabel)}
            prizePoolUsdt={lobby.rewardPoolUsdt}
            walletAddress={address}
            nickname={session?.nickname}
            mode={lobbyMode}
            opponents={opponents}
            matchId={lobby.finalMatchId}
            spectate
            liveOpponents={liveState?.slots}
          />
        </div>
      </div>
    );
  }

  if (waitingForOthers) {
    return (
      <div className="game-panel hud-corner mx-auto max-w-sm rounded-2xl p-6 text-center">
        {realTimeUp ? (
          <>
            <p className="text-2xl font-black uppercase tracking-wide text-glow-gold">{t("gameArena.timesUp")}</p>
            <p className="mt-2 animate-pulse text-xs uppercase tracking-widest text-muted">{t("gameArena.finalizingMatch")}</p>
          </>
        ) : (
          <>
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-line border-t-gold" />
            <h2 className="text-glow-gold text-2xl font-black">{t("lobby.waitingHeading")}</h2>
            <p className="mt-2 text-sm text-muted">{t("lobby.waitingBody")}</p>
          </>
        )}
        <p className="mt-1 text-sm font-bold text-foreground">
          {t("lobby.waitingCount", { submitted: waitingForOthers.submitted, total: waitingForOthers.total })}
        </p>
      </div>
    );
  }

  if (result) {
    return (
      <MatchResultReveal
        participants={result.participants}
        modeLabel={gameModeLabel(t, lobby.mode, lobby.modeLabel)}
        onPlayAgain={() => router.push("/dashboard/play")}
        dashboardHref="/dashboard"
      />
    );
  }

  if (lobby.status === "CANCELLED") {
    return (
      <div className="mx-auto max-w-md text-center">
        <p className="text-sm text-muted">
          {lobby.cancelReason === "RENTAL_BOT_NOT_ENOUGH_FRIENDS"
            ? t("lobby.cancelledRentalBotNotEnoughFriends")
            : lobby.cancelReason === "NOT_ENOUGH_FRIENDS"
              ? t("lobby.cancelledNotEnoughFriends")
              : t("lobby.cancelledNotice")}
        </p>
        <button onClick={() => router.push("/dashboard/play")} className="btn-game-outline mt-3 rounded-full px-4 py-2 text-sm">
          {t("lobby.backToGameModes")}
        </button>
      </div>
    );
  }

  const secondsLeft = Math.max(0, Math.round((new Date(lobby.expiresAt).getTime() - new Date(lobby.serverTime).getTime()) / 1000));
  const countdownLabel = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;
  const emptySeats = lobby.maxPlayers - lobby.humanCount;
  // Proactive mirror of the server's own hard block (POST
  // /api/lobbies/[id]/start, via lobbyNeedsMoreHumansForRentalBot) —
  // disables "Start with Random Players" instead of letting the host
  // hit a 409 after clicking it. Only reflects the VIEWER's own
  // selection (lobby.myRentalBot) since that's all this payload
  // exposes per-participant; the server check itself covers every
  // participant's selection regardless, so a non-host joiner equipping
  // a Rental Bot the host can't see here still gets enforced there.
  const rentalBotNeedsMoreHumans = !!lobby.myRentalBot && lobby.humanCount < RENTAL_BOT_MIN_HUMANS;
  // Explicit product direction: "Play with Friends" must actually be
  // played with a friend — mirrors the server's own hard block (POST
  // /api/lobbies/[id]/start, via lobbyNeedsMoreHumansToStart). Checked
  // separately from, and only when NOT already covered by,
  // rentalBotNeedsMoreHumans above — that message already explains a
  // stricter version of the same "invite someone" ask when a Rental Bot
  // is the reason, so this one only shows for the plain no-bot case.
  const soloNeedsMoreHumans = !rentalBotNeedsMoreHumans && lobby.humanCount < LOBBY_MIN_HUMANS_TO_START;

  // Recent opponents not already occupying a seat or already invited —
  // no point quick-inviting someone who's already in or already pending.
  const alreadyInOrInvited = new Set([
    ...lobby.slots.filter((s) => s.state === "HUMAN").map((s) => s.address!.toLowerCase()),
    ...lobby.pendingInvitations.map((inv) => inv.recipientAddress.toLowerCase()),
  ]);
  const recentPlayers = (recentPlayersData?.players ?? []).filter(
    (p) => !alreadyInOrInvited.has(p.address.toLowerCase())
  );

  // Not-yet-a-participant case — reached only via the "Accept and Join"
  // navigation for a direct invite (see IncomingInvitations/
  // IncomingInviteToast, which now send the recipient straight here
  // with ?invitationId=... instead of calling accept immediately).
  // Confirmed live as a real ask: accepting used to join the lobby
  // seat (visible to the host, who could already start) THEN show this
  // same loadout screen — so "joining" was already done before a
  // loadout was ever picked. Picks here are local-only (see
  // PreJoinLoadoutPicker's own doc-comment — there's no membership yet
  // to PATCH against); handleAcceptAndReady below does the real accept
  // first and only then applies them, so the seat only actually fills
  // (and the host only actually sees this wallet) once "I'm Ready" is
  // pressed here, not before.
  if (invitationId && !amIJoined && (lobby.status === "WAITING" || lobby.status === "FULL")) {
    return (
      <div className="mx-auto max-w-md">
        <div className="game-panel hud-corner rounded-2xl p-4">
          <p className="text-sm font-black uppercase tracking-wide text-gold">{t("lobby.loadoutIntroTitle")}</p>
          <p className="mt-1 text-xs text-muted">{t("lobby.loadoutIntroSubtitle")}</p>
        </div>
        <PreJoinLoadoutPicker selections={preJoinSelections} onChange={setPreJoinSelections} />
        {preJoinError && <p className="mt-2 text-xs text-risk">{preJoinError}</p>}
        <button
          onClick={handleAcceptAndReady}
          disabled={joiningFromInvite}
          className="btn-game hud-corner mt-4 w-full rounded-full px-4 py-2.5 text-sm disabled:opacity-50"
        >
          {t("lobby.loadoutIntroContinue")}
        </button>
        {/* No lobby membership exists yet at this point (see this
            screen's own doc-comment above — the real accept-invitation
            call only happens once "I'm Ready" is clicked) — so there's
            nothing to leave/cancel server-side here, just a real
            invitation still sitting PENDING. Two different ways back
            out, not one, because they mean different things to the
            host: Decline formally rejects it (existing invites-list
            action, reused here — the host is notified, the invite
            can't be re-accepted later); Cancel just leaves without
            deciding, so the invite stays PENDING and this same screen
            is still reachable again later from the invites list.
            Confirmed live as a real gap: this screen only ever offered
            a way FORWARD (accept), never back, unlike every other gate
            in this room. */}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            onClick={() => router.push("/dashboard/play")}
            disabled={joiningFromInvite}
            className="btn-game-outline w-full rounded-full px-4 py-2 text-sm disabled:opacity-50"
          >
            {t("lobby.cancelButton")}
          </button>
          <button
            onClick={() =>
              declineInvitation.mutateAsync(invitationId)
                .then(() => router.push("/dashboard/play"))
                .catch((e) => setPreJoinError(e instanceof Error ? e.message : t("play.failedToDeclineInvitation")))
            }
            disabled={joiningFromInvite || declineInvitation.isPending}
            className="btn-game-outline w-full rounded-full px-4 py-2 text-sm disabled:opacity-50"
          >
            {t("play.declineButton")}
          </button>
        </div>
      </div>
    );
  }

  // Already-a-participant case (host, or a wallet that reached this
  // page some other way — invite link, room code, or a page reload
  // after already accepting) — the same screen, but backed by the real
  // per-lobby panels (immediate PATCH per click) since membership
  // already exists. Blocks the rest of this waiting room entirely (not
  // an overlay on top of it) until "I'm Ready" — see showLoadoutIntro's
  // own doc-comment for why, and no dismiss besides that button (no X,
  // no Escape, no backdrop-click) on purpose: an escape hatch would let
  // someone skip straight past to the room exactly like before this
  // existed.
  if (showLoadoutIntro && (lobby.status === "WAITING" || lobby.status === "FULL")) {
    return (
      <div className="mx-auto max-w-md">
        <div className="game-panel hud-corner rounded-2xl p-4">
          <p className="text-sm font-black uppercase tracking-wide text-gold">{t("lobby.loadoutIntroTitle")}</p>
          <p className="mt-1 text-xs text-muted">{t("lobby.loadoutIntroSubtitle")}</p>
        </div>
        <LobbyLoadoutPanel lobbyId={lobby.id} myLoadout={lobby.myLoadout} hideHeading />
        <RentalBotPanel lobbyId={lobby.id} myRentalBot={lobby.myRentalBot} />
        <button
          onClick={() => setShowLoadoutIntro(false)}
          className="btn-game hud-corner mt-4 w-full rounded-full px-4 py-2.5 text-sm"
        >
          {t("lobby.loadoutIntroContinue")}
        </button>
        {/* Host-only — cancelling isn't valid for anyone else (see
            useCancelLobby's own host-only check server-side). Confirmed
            live as a real gap: the host who just created this lobby had
            no way to back out except clicking through to the full room
            first — this screen is the very first thing they see, so a
            way out belongs right here too, not just further in. */}
        {lobby.isHost ? (
          <button
            onClick={() => cancel.mutateAsync().catch((e) => setActionError(e instanceof Error ? e.message : t("lobby.failedToCancel")))}
            disabled={cancel.isPending}
            className="btn-game-outline mt-2 w-full rounded-full px-4 py-2 text-sm disabled:opacity-50"
          >
            {t("lobby.cancelButton")}
          </button>
        ) : (
          // A joined non-host participant can't cancel the whole room
          // (useCancelLobby is server-enforced host-only) — this is
          // their own equivalent way back out: leaves just this seat,
          // releasing their own entry-fee hold, and returns them to the
          // play hub. Confirmed live as the other half of the same gap
          // as the host's Cancel button above: a friend who accepted an
          // invite by mistake had no way out of this exact screen either.
          <button
            onClick={() =>
              leave.mutateAsync()
                .then(() => router.push("/dashboard/play"))
                .catch((e) => setActionError(e instanceof Error ? e.message : t("lobby.failedToLeave")))
            }
            disabled={leave.isPending}
            className="btn-game-outline mt-2 w-full rounded-full px-4 py-2 text-sm disabled:opacity-50"
          >
            {t("lobby.leaveButton")}
          </button>
        )}
        {actionError && <p className="mt-2 text-xs text-risk">{actionError}</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-glow-gold text-2xl font-black uppercase tracking-wide">{t("lobby.heading")}</h2>
          <p className="mt-1 text-sm text-muted">
            {t("lobby.summaryLine", { mode: gameModeLabel(t, lobby.mode, lobby.modeLabel), fee: lobby.entryFeeUsdt, code: lobby.roomCode })}
          </p>
        </div>
        {lobby.status === "WAITING" && (
          <span className="rounded-full border border-gold/25 bg-gold-soft px-3 py-1 text-xs font-black text-gold">{countdownLabel}</span>
        )}
      </div>

      <NotificationsPrompt />

      <div className="game-panel hud-corner mt-4 rounded-2xl p-4">
        <div className="grid grid-cols-1 gap-2">
          {lobby.slots.map((slot) => (
            <div
              key={slot.slotNumber}
              className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${
                slot.state === "HUMAN" ? "border-mint/25 bg-mint-soft" : "border-line bg-panel-2 text-muted"
              }`}
            >
              <span className="font-bold">{slot.slotNumber}.</span>
              {slot.state === "HUMAN" ? (
                <span className="flex-1 px-2">
                  {slot.address && displayName(slot.address, slot.nickname)} {slot.isHost ? t("lobby.hostTag") : t("lobby.joinedTag")}
                </span>
              ) : (
                <span className="flex-1 px-2">{t("lobby.waitingForPlayer")}</span>
              )}
            </div>
          ))}
        </div>

        {lobby.status !== "WAITING" && lobby.status !== "FULL" && (
          <p className="mt-3 text-center text-xs text-gold">{t("lobby.startingMatch")}</p>
        )}
      </div>

      {/* Every one of the 3 ways to end up in this lobby (host, direct
          invite accept, invite link, room code) lands right here before
          the match starts — so these two panels are the only place a
          loadout ever needs to be equipped for anyone in the room, not
          just the host. LobbyLoadoutPanel covers everything except
          RENTAL_BOT (its own separate panel, kept below) — previously
          Play-with-Friends never actually consumed a rocket skin or
          Speed/Health/Magnet/Fire/Shield upgrade at all. */}
      {(lobby.status === "WAITING" || lobby.status === "FULL") && (
        <>
          <LobbyLoadoutPanel lobbyId={lobby.id} myLoadout={lobby.myLoadout} />
          <RentalBotPanel lobbyId={lobby.id} myRentalBot={lobby.myRentalBot} />
        </>
      )}

      {lobby.isHost && (lobby.status === "WAITING" || lobby.status === "FULL") && (
        <>
          <div className="game-panel hud-corner mt-4 rounded-2xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gold">{t("lobby.invitePlayersHeading")}</p>
            <div className="mt-2 flex gap-2">
              <input
                value={inviteAddress}
                onChange={(e) => setInviteAddress(e.target.value)}
                placeholder={t("lobby.walletAddressPlaceholder")}
                className="flex-1 rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm"
              />
              <button onClick={sendInvite} disabled={invite.isPending || !inviteAddress.trim()} className="btn-game-outline rounded-lg px-4 py-2 text-sm disabled:opacity-50">
                {t("lobby.inviteButton")}
              </button>
            </div>
            {inviteError && <p className="mt-2 text-xs text-risk">{inviteError}</p>}
            {lobby.pendingInvitations.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-muted">
                {lobby.pendingInvitations.map((inv) => (
                  <li key={inv.id}>
                    {displayName(inv.recipientAddress, inv.recipientNickname)} {t("lobby.pendingTag")}
                  </li>
                ))}
              </ul>
            )}

            {recentPlayers.length > 0 && (
              <div className="mt-3 border-t border-line pt-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{t("lobby.recentPlayersHeading")}</p>
                <div className="mt-2 flex flex-col gap-1.5">
                  {recentPlayers.map((p) => (
                    <div key={p.address} className="flex items-center justify-between rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs">
                      <span>
                        {displayName(p.address, p.nickname)}
                        <span className="ml-1.5 text-muted">
                          · {t(p.gamesTogether > 1 ? "lobby.gamesTogetherPlural" : "lobby.gamesTogetherSingular", { count: p.gamesTogether })}
                        </span>
                      </span>
                      <button
                        onClick={() => quickInvite(p.address)}
                        disabled={invite.isPending}
                        className="btn-game-outline rounded-full px-3 py-1 text-[11px] disabled:opacity-50"
                      >
                        {t("lobby.inviteButton")}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3 border-t border-line pt-3">
              {!lobby.hasInviteLink && !inviteLink ? (
                <button onClick={getOrCreateLink} className="btn-game-outline w-full rounded-full px-4 py-2 text-sm">
                  {t("lobby.generateInviteLink")}
                </button>
              ) : (
                <div className="flex gap-2">
                  {inviteLink && (
                    <input readOnly value={inviteLink} className="flex-1 rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs text-muted" />
                  )}
                  {inviteLink && (
                    <button onClick={copyLink} className="btn-game-outline rounded-lg px-3 py-2 text-xs">
                      {copied ? t("lobby.copiedLabel") : t("lobby.copyLabel")}
                    </button>
                  )}
                  <button onClick={disableLinkNow} className="btn-game-outline rounded-lg px-3 py-2 text-xs">
                    {t("lobby.disableLabel")}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {rentalBotNeedsMoreHumans ? (
              <p className="rounded-xl border border-gold/25 bg-gold-soft px-3 py-2 text-center text-xs text-gold">
                {t("lobby.rentalBotNeedsFriends", { count: RENTAL_BOT_MIN_HUMANS - lobby.humanCount })}
              </p>
            ) : soloNeedsMoreHumans ? (
              <div className="rounded-xl border border-gold/25 bg-gold-soft px-3 py-2 text-center">
                <p className="text-xs text-gold">
                  {t("lobby.soloNeedsFriends", { count: LOBBY_MIN_HUMANS_TO_START - lobby.humanCount })}
                </p>
                <button
                  onClick={() => router.push("/dashboard/play")}
                  className="btn-game-outline mt-2 w-full rounded-full px-4 py-1.5 text-xs"
                >
                  {t("lobby.playSoloInstead")}
                </button>
              </div>
            ) : (
              <button
                onClick={() => start.mutateAsync().catch((e) => setActionError(e instanceof Error ? e.message : t("lobby.failedToStart")))}
                disabled={start.isPending}
                className="btn-game hud-corner w-full whitespace-nowrap rounded-full px-4 py-2 text-sm disabled:opacity-50"
              >
                {emptySeats > 0 ? t("lobby.startWithRandomPlayers") : t("lobby.startMatchButton")}
              </button>
            )}
            <button
              onClick={() => cancel.mutateAsync().catch((e) => setActionError(e instanceof Error ? e.message : t("lobby.failedToCancel")))}
              disabled={cancel.isPending}
              className="btn-game-outline w-full rounded-full px-4 py-2 text-sm disabled:opacity-50"
            >
              {t("lobby.cancelButton")}
            </button>
          </div>
          {actionError && <p className="mt-2 text-xs text-risk">{actionError}</p>}
        </>
      )}

      {/* Non-host equivalent of the host's Cancel button right above —
          same dual placement (also on the loadout-intro gate screen
          above) for the same reason: the direct-invite-accept path
          (handleAcceptAndReady) deliberately skips straight past that
          gate screen once "I'm Ready" is clicked there (to avoid
          showing the same loadout pickers twice), so a participant who
          joined that way would otherwise never see a way to back out
          at all. Confirmed live as a real gap: only the invite-link/
          room-code paths (which DO stop on the gate screen first) ever
          saw the leave button before this. */}
      {!lobby.isHost && (lobby.status === "WAITING" || lobby.status === "FULL") && (
        <div className="mt-4">
          <button
            onClick={() =>
              leave.mutateAsync()
                .then(() => router.push("/dashboard/play"))
                .catch((e) => setActionError(e instanceof Error ? e.message : t("lobby.failedToLeave")))
            }
            disabled={leave.isPending}
            className="btn-game-outline w-full rounded-full px-4 py-2 text-sm disabled:opacity-50"
          >
            {t("lobby.leaveButton")}
          </button>
          {actionError && <p className="mt-2 text-xs text-risk">{actionError}</p>}
        </div>
      )}
    </div>
  );
}
