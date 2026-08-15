"use client";

import { useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLocale, type TranslationKey } from "@/lib/i18n/LocaleProvider";

const COUNTRIES: readonly [string, TranslationKey][] = [
  ["US", "onboardingGate.countryUS"],
  ["GB", "onboardingGate.countryGB"],
  ["CA", "onboardingGate.countryCA"],
  ["AU", "onboardingGate.countryAU"],
  ["DE", "onboardingGate.countryDE"],
  ["IN", "onboardingGate.countryIN"],
  ["SG", "onboardingGate.countrySG"],
  ["AE", "onboardingGate.countryAE"],
  ["OT", "onboardingGate.countryOther"],
];

// Doc section 3.1 step 6 / 20.3: age + country declaration and terms
// acceptance before paid play — NOT a KYC document check.
export function OnboardingGate({ children }: { children: ReactNode }) {
  const { session, refresh } = useAuth();
  const { t } = useLocale();
  const [countryCode, setCountryCode] = useState("US");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!session?.requiresOnboarding) {
    return <>{children}</>;
  }

  async function submit() {
    if (!ageConfirmed || !agreedTerms) {
      setError(t("onboardingGate.confirmError"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryCode, ageConfirmed: true }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? t("onboardingGate.couldNotSave"));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("onboardingGate.couldNotSave"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="game-panel hud-corner glow-gold mx-auto max-w-md rounded-2xl p-6">
      <h2 className="text-glow-gold text-xl font-black uppercase tracking-wide">{t("onboardingGate.heading")}</h2>
      <p className="mt-1 text-sm text-muted">
        {t("onboardingGate.body")}
      </p>

      <div className="mt-5 space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">{t("onboardingGate.countryLabel")}</span>
          <select
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
            className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm"
          >
            {COUNTRIES.map(([code, key]) => (
              <option key={code} value={code}>
                {t(key)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={ageConfirmed}
            onChange={(e) => setAgeConfirmed(e.target.checked)}
            className="mt-0.5"
          />
          <span>{t("onboardingGate.ageCheckboxLabel")}</span>
        </label>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={agreedTerms}
            onChange={(e) => setAgreedTerms(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            {t("onboardingGate.termsCheckboxLabel")}
          </span>
        </label>

        {error && <p className="text-xs text-risk">{error}</p>}

        <button
          onClick={submit}
          disabled={submitting}
          className="btn-game hud-corner w-full rounded-full px-4 py-2.5 text-sm"
        >
          {submitting ? t("onboardingGate.savingButton") : t("onboardingGate.continueButton")}
        </button>
      </div>
    </div>
  );
}
