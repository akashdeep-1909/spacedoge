"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { OnboardingGate } from "@/components/OnboardingGate";
import { useAuth } from "@/lib/auth-context";
import { CoinRushArena } from "@/components/game/CoinRushArena";
import { copyToClipboard } from "@/lib/clipboard";
import { getPublicOrigin } from "@/lib/publicUrl";
import { NotificationsPrompt } from "@/components/NotificationsPrompt";
import { THEME_BY_MODE } from "@/lib/game-config";
import type { GameMode } from "@/generated/prisma/enums";
import { MatchResultReveal, type MatchParticipantResult, type MatchPoolSummary } from "@/components/game/MatchResultReveal";
import {
  useLobby,
  useInviteToLobby,
  useStartLobby,
  useCancelLobby,
  useGenerateInviteLink,
  useDisableInviteLink,
  useSubmitMatchResults,
  useRecentPlayers,
  useMatchRoster,
} from "@/lib/hooks";

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
  const queryClient = useQueryClient();
  const submitResults = useSubmitMatchResults();

  const [inviteAddress, setInviteAddress] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [origin] = useState(() => getPublicOrigin());
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

  const invite = useInviteToLobby(lobbyId);
  const start = useStartLobby(lobbyId);
  const cancel = useCancelLobby(lobbyId);
  const generateLink = useGenerateInviteLink(lobbyId);
  const disableLink = useDisableInviteLink(lobbyId);
  const { data: recentPlayersData } = useRecentPlayers();
  const { data: rosterData } = useMatchRoster(lobby?.finalMatchId ?? null);

  // Derived, not synced via an effect: the arena shows exactly while
  // the match is live, this client hasn't submitted its own result yet,
  // and no result (or wait state) has landed.
  const showGame = lobby?.status === "STARTED" && !!lobby.finalMatchId && !submitted && !result && !waitingForOthers;
  const lastScore = useRef({ score: 0, durationPlayedSec: 0 });

  // Memoized (not recomputed every render) on finalMatchId/startedAt —
  // CoinRushArena's own setup effect depends on this value, so
  // recomputing it on every poll tick would re-initialize the whole
  // game repeatedly. Without this, loading or reloading this page
  // anytime after the real lobby.startedAt (a slow initial load, a
  // backgrounded tab, a refresh) starts the mission clock fresh at the
  // full duration instead of wherever the server-authoritative match
  // actually is.
  const startElapsedSec = useMemo(
    () => (lobby?.finalMatchId && lobby.startedAt ? elapsedSecondsSince(lobby.startedAt) : 0),
    [lobby]
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

  async function handleComplete(payload: { score: number; durationPlayedSec: number }) {
    if (!lobby?.finalMatchId) return;
    lastScore.current = payload;
    setSubmitted(true);
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
  }

  // Same rationale as the instant-play "Quit" button: without this, a
  // human who closes the game before finishing would leave the OTHER
  // participants' /results calls waiting forever (only resolved once
  // the match's resultsDeadlineAt eventually passes). Reporting 0
  // immediately unblocks everyone else and this wallet's own busy-check
  // right away instead of waiting out the grace period.
  async function quitMatch() {
    if (!lobby?.finalMatchId) return;
    await handleComplete({ score: 0, durationPlayedSec: 0 });
  }

  async function sendInvite() {
    setInviteError(null);
    try {
      await invite.mutateAsync(inviteAddress.trim());
      setInviteAddress("");
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to send invitation");
    }
  }

  async function quickInvite(playerAddress: string) {
    setInviteError(null);
    try {
      await invite.mutateAsync(playerAddress);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to send invitation");
    }
  }

  async function getOrCreateLink() {
    try {
      const { token } = await generateLink.mutateAsync();
      setInviteLink(`${origin}/play/join/${token}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to generate invite link");
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

  if (isLoading) return <p className="mx-auto max-w-md text-sm text-muted">Loading lobby…</p>;
  if (loadError || !lobby) {
    return (
      <div className="mx-auto max-w-md">
        <p className="text-sm text-risk">{loadError instanceof Error ? loadError.message : "Lobby not found"}</p>
        <button onClick={() => router.push("/dashboard/play")} className="btn-game-outline mt-3 rounded-full px-4 py-2 text-sm">
          Back to Game Modes
        </button>
      </div>
    );
  }

  if (showGame && lobby.finalMatchId) {
    const lobbyMode = lobby.mode as GameMode;
    const lobbyTheme = THEME_BY_MODE[lobbyMode] ?? THEME_BY_MODE.EXPLORER_RUSH;
    const opponents = rosterData?.seats
      .filter((s) => !s.isYou)
      .sort((a, b) => (a.slotNumber ?? 0) - (b.slotNumber ?? 0))
      .map((s) => ({ isBot: s.isBot, label: s.label }));
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-2.5"
        style={{
          background: `radial-gradient(circle at 12% 0%, ${lobbyTheme.modalGlow}, transparent 30%), radial-gradient(circle at 88% 8%, rgba(33,220,255,.18), transparent 34%), radial-gradient(circle at 45% 100%, rgba(255,209,102,.1), transparent 35%), linear-gradient(180deg,#020811,#09101d 62%,#020811)`,
        }}
      >
        <div className="relative h-[min(930px,calc(100vh-20px))] w-[min(450px,calc(100vw-20px))] overflow-hidden rounded-[36px] border border-white/15 bg-[#06101a] shadow-2xl">
          <button
            onClick={quitMatch}
            className="absolute right-3 top-3 z-10 rounded-full border border-white/20 bg-black/50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white/70 backdrop-blur transition hover:border-risk/40 hover:text-risk"
          >
            ✕ Quit
          </button>
          <CoinRushArena
            mapSeed={lobby.id}
            durationSec={lobby.durationSec}
            startElapsedSec={startElapsedSec}
            onComplete={handleComplete}
            fullscreen
            missionTitle={lobby.modeLabel}
            prizePoolUsdt={lobby.nominalRoomPoolUsdt}
            walletAddress={address}
            nickname={session?.nickname}
            mode={lobbyMode}
            opponents={opponents}
          />
        </div>
      </div>
    );
  }

  if (waitingForOthers) {
    return (
      <div className="game-panel hud-corner mx-auto max-w-sm rounded-2xl p-6 text-center">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-line border-t-gold" />
        <h2 className="text-glow-gold text-2xl font-black">Waiting for other racers…</h2>
        <p className="mt-2 text-sm text-muted">Your run is finished, hang tight while everyone else finishes theirs.</p>
        <p className="mt-1 text-sm font-bold text-foreground">
          {waitingForOthers.submitted} of {waitingForOthers.total} results in.
        </p>
      </div>
    );
  }

  if (result) {
    return (
      <MatchResultReveal
        participants={result.participants}
        modeLabel={lobby.modeLabel}
        onPlayAgain={() => router.push("/dashboard/play")}
        dashboardHref="/dashboard"
      />
    );
  }

  if (lobby.status === "CANCELLED") {
    return (
      <div className="mx-auto max-w-md text-center">
        <p className="text-sm text-muted">This lobby was cancelled. Any held entry fee has been returned to your Deposit USDT.</p>
        <button onClick={() => router.push("/dashboard/play")} className="btn-game-outline mt-3 rounded-full px-4 py-2 text-sm">
          Back to Game Modes
        </button>
      </div>
    );
  }

  const secondsLeft = Math.max(0, Math.round((new Date(lobby.expiresAt).getTime() - new Date(lobby.serverTime).getTime()) / 1000));
  const countdownLabel = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;
  const emptySeats = lobby.maxPlayers - lobby.humanCount;

  // Recent opponents not already occupying a seat or already invited —
  // no point quick-inviting someone who's already in or already pending.
  const alreadyInOrInvited = new Set([
    ...lobby.slots.filter((s) => s.state === "HUMAN").map((s) => s.address!.toLowerCase()),
    ...lobby.pendingInvitations.map((inv) => inv.recipientAddress.toLowerCase()),
  ]);
  const recentPlayers = (recentPlayersData?.players ?? []).filter(
    (p) => !alreadyInOrInvited.has(p.address.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-md">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-glow-gold text-2xl font-black uppercase tracking-wide">👥 Play with Friends</h2>
          <p className="mt-1 text-sm text-muted">
            {lobby.modeLabel} · {lobby.entryFeeUsdt} USDT entry · Room {lobby.roomCode}
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
                  {slot.address && displayName(slot.address, slot.nickname)} {slot.isHost ? "(Host)" : "(Joined)"}
                </span>
              ) : (
                <span className="flex-1 px-2">Waiting for player…</span>
              )}
            </div>
          ))}
        </div>

        {lobby.status !== "WAITING" && lobby.status !== "FULL" && (
          <p className="mt-3 text-center text-xs text-gold">Starting match…</p>
        )}
      </div>

      {lobby.isHost && (lobby.status === "WAITING" || lobby.status === "FULL") && (
        <>
          <div className="game-panel hud-corner mt-4 rounded-2xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gold">Invite Players</p>
            <div className="mt-2 flex gap-2">
              <input
                value={inviteAddress}
                onChange={(e) => setInviteAddress(e.target.value)}
                placeholder="0x wallet address"
                className="flex-1 rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm"
              />
              <button onClick={sendInvite} disabled={invite.isPending || !inviteAddress.trim()} className="btn-game-outline rounded-lg px-4 py-2 text-sm disabled:opacity-50">
                Invite
              </button>
            </div>
            {inviteError && <p className="mt-2 text-xs text-risk">{inviteError}</p>}
            {lobby.pendingInvitations.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-muted">
                {lobby.pendingInvitations.map((inv) => (
                  <li key={inv.id}>
                    {displayName(inv.recipientAddress, inv.recipientNickname)} (pending)
                  </li>
                ))}
              </ul>
            )}

            {recentPlayers.length > 0 && (
              <div className="mt-3 border-t border-line pt-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Recent Players</p>
                <div className="mt-2 flex flex-col gap-1.5">
                  {recentPlayers.map((p) => (
                    <div key={p.address} className="flex items-center justify-between rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs">
                      <span>
                        {displayName(p.address, p.nickname)}
                        <span className="ml-1.5 text-muted">
                          · {p.gamesTogether} game{p.gamesTogether > 1 ? "s" : ""} together
                        </span>
                      </span>
                      <button
                        onClick={() => quickInvite(p.address)}
                        disabled={invite.isPending}
                        className="btn-game-outline rounded-full px-3 py-1 text-[11px] disabled:opacity-50"
                      >
                        Invite
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3 border-t border-line pt-3">
              {!lobby.hasInviteLink && !inviteLink ? (
                <button onClick={getOrCreateLink} className="btn-game-outline w-full rounded-full px-4 py-2 text-sm">
                  Generate Invite Link
                </button>
              ) : (
                <div className="flex gap-2">
                  {inviteLink && (
                    <input readOnly value={inviteLink} className="flex-1 rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs text-muted" />
                  )}
                  {inviteLink && (
                    <button onClick={copyLink} className="btn-game-outline rounded-lg px-3 py-2 text-xs">
                      {copied ? "Copied" : "Copy"}
                    </button>
                  )}
                  <button onClick={disableLinkNow} className="btn-game-outline rounded-lg px-3 py-2 text-xs">
                    Disable
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <button
              onClick={() => start.mutateAsync().catch((e) => setActionError(e instanceof Error ? e.message : "Failed to start"))}
              disabled={start.isPending}
              className="btn-game hud-corner w-full whitespace-nowrap rounded-full px-4 py-2 text-sm disabled:opacity-50"
            >
              {emptySeats > 0 ? "Start with Random Players" : "Start Match"}
            </button>
            <button
              onClick={() => cancel.mutateAsync().catch((e) => setActionError(e instanceof Error ? e.message : "Failed to cancel"))}
              disabled={cancel.isPending}
              className="btn-game-outline w-full rounded-full px-4 py-2 text-sm disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
          {actionError && <p className="mt-2 text-xs text-risk">{actionError}</p>}
        </>
      )}
    </div>
  );
}
