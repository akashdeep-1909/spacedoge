"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useMyInvitations, useAcceptInvitation, useDeclineInvitation } from "@/lib/hooks";
import { gameModeLabel } from "@/lib/game-mode-labels";

// Global "someone invited you to play" toast, mounted once in
// DashboardChrome so it's present on every /dashboard/* page — not
// just the Play tab.
//
// Confirmed live as a real gap: useMyInvitations() (a 4s poll — this
// app has no push infra for in-app updates, see src/lib/lobby.ts;
// browser/OS push notifications are a separate, already-working path
// this doesn't touch) was previously only ever called from the Play
// tab's own IncomingInvitations banner (src/app/dashboard/play/page.tsx),
// a React Query hook that only runs while its component is actually
// mounted. The moment a player navigated to any OTHER tab, that
// component unmounted, the poll simply stopped, and an invitation that
// arrived while they were on Wallet/Mining/anywhere else went
// completely unnoticed in-app until they happened to click back into
// Play on their own.
//
// Suppressed on the Play page itself (exact match, same convention
// DashboardChrome's own nav highlighting uses) since that page already
// renders the identical invitation as a full inline banner right
// there — showing this too would just be a duplicate of the same
// thing on the same screen.
export function IncomingInviteToast() {
  const { t } = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const { data } = useMyInvitations();
  const accept = useAcceptInvitation();
  const decline = useDeclineInvitation();
  // Local-only — a toast the player dismisses (without accepting or
  // declining) just stops showing for the rest of this page session;
  // it doesn't touch the invitation's own PENDING status server-side,
  // so it's still sitting there to accept/decline from the Play tab
  // whenever they get to it.
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [errorById, setErrorById] = useState<Record<string, string>>({});

  // Also suppressed inside an actual lobby/match (/dashboard/play/lobby/*)
  // — that page can be a full-screen live match (fixed inset-0, above
  // this toast's own z-index), where a popup about a SECOND invite
  // would either be invisible behind the game canvas or, worse, pop up
  // on top of it mid-race. Either way, someone already mid-match isn't
  // in a position to act on a new invite right now regardless.
  if (pathname === "/dashboard/play" || pathname?.startsWith("/dashboard/play/lobby/")) return null;

  const pending = (data?.incoming ?? []).filter((inv) => inv.status === "PENDING" && !dismissedIds.has(inv.id));
  if (pending.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-3
                 lg:inset-x-auto lg:right-4 lg:bottom-4 lg:items-end"
    >
      {pending.map((inv) => {
        const shortAddress = `${inv.otherAddress.slice(0, 6)}…${inv.otherAddress.slice(-4)}`;
        return (
          <div
            key={inv.id}
            className="game-panel hud-corner glow-gold pointer-events-auto w-full max-w-sm rounded-2xl border-gold/40 p-3.5 text-sm shadow-2xl"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="flex-1">
                <span className="font-bold">{shortAddress}</span>{" "}
                {t("play.invitationText", { fee: inv.entryFeeUsdt, mode: gameModeLabel(t, inv.mode, inv.modeLabel) })}
              </p>
              <button
                onClick={() => setDismissedIds((prev) => new Set(prev).add(inv.id))}
                className="shrink-0 text-muted transition hover:text-foreground"
                aria-label={t("notificationsPrompt.dismissButton")}
              >
                ✕
              </button>
            </div>
            {errorById[inv.id] && <p className="mt-1.5 text-xs text-risk">{errorById[inv.id]}</p>}
            <div className="mt-2 flex gap-2">
              <button
                onClick={async () => {
                  setErrorById((prev) => ({ ...prev, [inv.id]: "" }));
                  try {
                    const lobby = await accept.mutateAsync(inv.id);
                    router.push(`/dashboard/play/lobby/${lobby.id}`);
                  } catch (err) {
                    setErrorById((prev) => ({ ...prev, [inv.id]: err instanceof Error ? err.message : t("play.failedToAcceptInvitation") }));
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
    </div>
  );
}
