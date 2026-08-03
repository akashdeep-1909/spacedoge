"use client";

import { useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";

const COUNTRIES = [
  ["US", "United States"],
  ["GB", "United Kingdom"],
  ["CA", "Canada"],
  ["AU", "Australia"],
  ["DE", "Germany"],
  ["IN", "India"],
  ["SG", "Singapore"],
  ["AE", "United Arab Emirates"],
  ["OT", "Other"],
] as const;

// Doc section 3.1 step 6 / 20.3: age + country declaration and terms
// acceptance before paid play — NOT a KYC document check.
export function OnboardingGate({ children }: { children: ReactNode }) {
  const { session, refresh } = useAuth();
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
      setError("Confirm your age and accept the terms to continue.");
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
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not save.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="game-panel hud-corner glow-gold mx-auto max-w-md rounded-2xl p-6">
      <h2 className="text-glow-gold text-xl font-black uppercase tracking-wide">⚡ One Quick Step</h2>
      <p className="mt-1 text-sm text-muted">
        Age and country are required before paid play (no ID upload, no document check).
      </p>

      <div className="mt-5 space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Country</span>
          <select
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
            className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm"
          >
            {COUNTRIES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
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
          <span>I confirm I meet the minimum age requirement in my jurisdiction.</span>
        </label>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={agreedTerms}
            onChange={(e) => setAgreedTerms(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            I accept the Game Rules and Mining Terms. Mining output and game outcomes are
            variable and not guaranteed.
          </span>
        </label>

        {error && <p className="text-xs text-risk">{error}</p>}

        <button
          onClick={submit}
          disabled={submitting}
          className="btn-game hud-corner w-full rounded-full px-4 py-2.5 text-sm"
        >
          {submitting ? "Saving…" : "Continue"}
        </button>
      </div>
    </div>
  );
}
