"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";

// The one dedicated full-page message a blocked wallet ever sees —
// mounted from exactly two places: AuthProvider itself (a global
// overlay covering the sign-in-time refusal from /api/auth/verify, so
// it shows regardless of which page the connect attempt happened on)
// and src/app/dashboard/layout.tsx (an already-open session that's
// since been blocked, re-checked fresh on every request). Static chrome
// is i18n'd; `note` itself is the admin's own free-text reason, shown
// completely verbatim — never translated, never paraphrased.
//
// Takes `onDisconnect` as a prop rather than calling useAuth() itself —
// AuthProvider (src/lib/auth-context.tsx) is this component's OWN
// mount point for the sign-in-time case, and useAuth() only works
// inside that provider's tree; a prop avoids a circular import between
// the two files entirely. The dashboard-layout mount point (a fresh
// session that's since been blocked) has no signOut() of its own to
// offer server-side, so it simply omits the prop.
export function BlockedAccountScreen({ note, onDisconnect }: { note: string | null; onDisconnect?: () => void }) {
  const { t } = useLocale();

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-5 p-6 text-center">
      <h1 className="text-glow-gold text-2xl font-black uppercase tracking-wide">SPACE DOGE</h1>
      <div className="game-panel hud-corner w-full rounded-2xl border-risk/40 p-5">
        <p className="text-3xl">🚫</p>
        <h2 className="mt-2 text-xl font-black text-risk">{t("blockedAccount.heading")}</h2>
        <p className="mt-1 text-sm text-muted">{t("blockedAccount.subheading")}</p>
        <div className="mt-4 rounded-xl border border-risk/25 bg-risk-soft p-3 text-left">
          <p className="text-[10px] font-bold uppercase tracking-widest text-risk">{t("blockedAccount.reasonLabel")}</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
            {note ?? t("blockedAccount.noReasonFallback")}
          </p>
        </div>
        <p className="mt-4 text-xs text-muted">{t("blockedAccount.contactHint")}</p>
        <button
          onClick={
            onDisconnect ??
            (() => {
              // Fallback for the dashboard-layout mount point, which has
              // no client-side signOut() to hand down (this component
              // renders straight out of a Server Component there). Same
              // two real effects signOut() itself performs — clear the
              // session cookie, then a full reload — just invoked
              // directly instead of through useAuth().
              fetch("/api/auth/logout", { method: "POST" }).finally(() => window.location.reload());
            })
          }
          className="btn-game hud-corner mt-4 w-full rounded-full px-4 py-2 text-sm"
        >
          {t("blockedAccount.disconnectButton")}
        </button>
      </div>
    </div>
  );
}
