"use client";

import { useEffect, useState } from "react";
import { isPushSupported, isPushSubscribed, enablePushNotifications } from "@/lib/pushClient";
import { useLocale } from "@/lib/i18n/LocaleProvider";

const DISMISS_KEY = "notifications-prompt-dismissed";

// Shown on the play/lobby pages so a host knows the moment someone
// accepts or declines, and an invitee knows the moment they're
// invited, without needing that page open (see src/lib/push.ts /
// public/sw.js) — this app has no other way to reach a player who
// isn't actively on the page. Silently hides itself if push isn't
// supported, permission was already denied at the browser level, the
// wallet is already subscribed, or the user dismissed it before.
export function NotificationsPrompt() {
  const { t } = useLocale();
  const [visible, setVisible] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function check() {
      if (!isPushSupported()) return;
      if (typeof Notification !== "undefined" && Notification.permission === "denied") return;
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
      if (await isPushSubscribed()) return;
      setVisible(true);
    }
    check();
  }, []);

  if (!visible) return null;

  async function enable() {
    setError(null);
    setEnabling(true);
    const result = await enablePushNotifications();
    setEnabling(false);
    if (result.ok) {
      setVisible(false);
    } else {
      setError(result.error ?? t("notificationsPrompt.couldNotEnable"));
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  return (
    <div className="mt-4 rounded-xl border border-gold/25 bg-gold-soft px-3 py-2.5 text-xs text-gold">
      <div className="flex items-center justify-between gap-3">
        <span>{t("notificationsPrompt.body")}</span>
        <div className="flex shrink-0 gap-1.5">
          <button onClick={enable} disabled={enabling} className="btn-game rounded-full px-3 py-1 text-[11px] disabled:opacity-50">
            {enabling ? t("notificationsPrompt.enablingButton") : t("notificationsPrompt.enableButton")}
          </button>
          <button onClick={dismiss} className="rounded-full border border-gold/30 px-3 py-1 text-[11px] text-gold/80 hover:text-gold">
            {t("notificationsPrompt.dismissButton")}
          </button>
        </div>
      </div>
      {error && <p className="mt-1.5 text-[11px] text-risk">{error}</p>}
    </div>
  );
}
