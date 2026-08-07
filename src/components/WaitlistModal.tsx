"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, X, Rocket } from "lucide-react";
import { useLocale } from "@/lib/i18n/LocaleProvider";

// Public "Join Waitlist" popup — reachable from marketing pages only
// (LandingContent, HowItWorksContent), no wallet/session required.
// `ld-glass` styling to match those pages' own cards/CTAs, not the
// dashboard's `game-panel` HUD look SuccessModal/ShareSheet use.
export function WaitlistModal({ source, onClose }: { source: string; onClose: () => void }) {
  const { t } = useLocale();
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  function close() {
    setVisible(false);
    setTimeout(onClose, 150);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t("waitlist.invalidEmail"));
      return;
    }
    setStatus("submitting");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source }),
      });
      if (!res.ok) throw new Error();
      setStatus("done");
    } catch {
      setStatus("idle");
      setError(t("waitlist.submitError"));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-150 ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={close}
      />
      <div
        className={`ld-glass relative w-full max-w-sm rounded-2xl p-6 text-center transition-all duration-150 ${
          visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-95 opacity-0"
        }`}
      >
        <button
          onClick={close}
          aria-label={t("common.closeButton")}
          className="absolute right-3 top-3 text-muted transition hover:text-foreground"
        >
          <X size={18} />
        </button>

        {status === "done" ? (
          <>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-mint-soft text-mint">
              <CheckCircle2 size={30} />
            </div>
            <h3 className="mt-4 text-lg font-bold">{t("waitlist.successHeading")}</h3>
            <p className="mt-1.5 text-sm text-muted">{t("waitlist.successBody")}</p>
            <button onClick={close} className="btn-game hud-corner mt-5 w-full rounded-full py-2.5 text-sm">
              {t("common.okButton")}
            </button>
          </>
        ) : (
          <>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-gold-soft text-gold">
              <Rocket size={26} />
            </div>
            <h3 className="mt-4 text-lg font-bold">{t("waitlist.heading")}</h3>
            <p className="mt-1.5 text-sm text-muted">{t("waitlist.body")}</p>
            <form onSubmit={submit} className="mt-4 flex flex-col gap-2.5 text-left">
              <input
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("waitlist.emailPlaceholder")}
                disabled={status === "submitting"}
                className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2.5 text-sm text-foreground outline-none focus:border-gold/60"
              />
              <button
                type="submit"
                disabled={status === "submitting" || !email.trim()}
                className="btn-game hud-corner w-full rounded-full py-2.5 text-sm disabled:opacity-50"
              >
                {status === "submitting" ? t("waitlist.submitting") : t("waitlist.submitButton")}
              </button>
              {error && <span className="text-center text-xs text-risk">{error}</span>}
            </form>
          </>
        )}
      </div>
    </div>
  );
}
