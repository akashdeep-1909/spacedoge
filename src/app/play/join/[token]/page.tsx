"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { OnboardingGate } from "@/components/OnboardingGate";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/i18n/LocaleProvider";

interface LinkPreview {
  lobbyId: string;
  roomCode: string;
  modeLabel: string;
  entryFeeUsdt: number;
  durationSec: number;
  hostAddress: string;
  seatsTaken: number;
  maxPlayers: number;
  expiresAt: string;
  serverTime: string;
}

// Public, unauthenticated landing page for a shared lobby invite link
// (spec section 14). Deliberately outside /dashboard — a visitor
// arriving here may not have a session yet, so this reuses the same
// ConnectWalletButton/useAuth SIWE flow the landing page uses, then
// hands off to the authenticated join endpoint once signed in.
export default function JoinLobbyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { session } = useAuth();
  const router = useRouter();
  const { t } = useLocale();
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/invite-links/${token}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? t("joinLobby.invalidLinkError"));
        if (!cancelled) setPreview(body);
      })
      .catch((err) => !cancelled && setLoadError(err instanceof Error ? err.message : t("joinLobby.invalidLinkError")));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function joinNow() {
    setJoinError(null);
    setJoining(true);
    try {
      const res = await fetch(`/api/invite-links/${token}/join`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? t("joinLobby.joinFailedError"));
      router.push(`/dashboard/play/lobby/${body.id}`);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : t("joinLobby.joinFailedError"));
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-5 p-6 text-center">
      <h1 className="text-glow-gold text-2xl font-black uppercase tracking-wide">SPACE DOGE</h1>

      {loadError && <p className="text-sm text-risk">{loadError}</p>}

      {preview && !loadError && (
        <div className="game-panel hud-corner w-full rounded-2xl p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gold">{t("joinLobby.invitedLabel")}</p>
          <h2 className="mt-1 text-xl font-black">{preview.modeLabel}</h2>
          <p className="mt-1 text-sm text-muted">
            {t("joinLobby.entrySummary", { fee: preview.entryFeeUsdt, duration: preview.durationSec })}
          </p>
          <p className="mt-2 text-xs text-muted">
            {t("joinLobby.hostSummary", {
              host: `${preview.hostAddress.slice(0, 6)}…${preview.hostAddress.slice(-4)}`,
              taken: preview.seatsTaken,
              max: preview.maxPlayers,
            })}
          </p>

          {session?.authenticated ? (
            <OnboardingGate>
              <button
                onClick={joinNow}
                disabled={joining}
                className="btn-game hud-corner mt-4 w-full rounded-full px-4 py-2 text-sm disabled:opacity-50"
              >
                {joining ? t("joinLobby.joiningButton") : t("play.acceptAndJoinButton")}
              </button>
              {joinError && (
                <div className="mt-3 rounded-xl border border-risk/25 bg-risk-soft p-3">
                  <p className="text-xs text-risk">{joinError}</p>
                  {joinError.includes("Deposit USDT") && (
                    <Link
                      href="/dashboard/deposit"
                      className="btn-game hud-corner mt-2 inline-block rounded-full px-4 py-1.5 text-xs"
                    >
                      {t("deposit.depositUsdtLabel")}
                    </Link>
                  )}
                </div>
              )}
            </OnboardingGate>
          ) : (
            <div className="mt-4">
              <p className="mb-2 text-xs text-muted">{t("joinLobby.connectPrompt")}</p>
              <ConnectWalletButton />
            </div>
          )}
        </div>
      )}

      {!preview && !loadError && <p className="text-sm text-muted">{t("joinLobby.loadingInvite")}</p>}
    </div>
  );
}
