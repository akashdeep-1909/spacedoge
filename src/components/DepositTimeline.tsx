"use client";

import { Check, Loader2, X, Clock } from "lucide-react";
import type { VerifyDepositResult } from "@/lib/hooks";
import { useLocale } from "@/lib/i18n/LocaleProvider";

// Shared step-by-step status display for a single deposit being
// verified — used by BOTH the auto-verify path (WalletDepositButton's
// own post-send check) and the manual "paste tx hash" path
// (dashboard/deposit/page.tsx), so a user sees the exact same shape of
// feedback regardless of which one they're using. Requested explicitly:
// "Show proper Timeline step by step what's going now like Deposited
// Amount, Coin and Chain, Pending, Verification, Passed, Credit or
// Failed Try Verify Hash Manually."
type Stage = "pending" | "verifying" | "passed" | "credited" | "failed";

type T = ReturnType<typeof useLocale>["t"];

function steps(t: T): { key: Stage; label: string }[] {
  return [
    { key: "pending", label: t("depositTimeline.stepPending") },
    { key: "verifying", label: t("depositTimeline.stepVerification") },
    { key: "passed", label: t("depositTimeline.stepPassed") },
    { key: "credited", label: t("depositTimeline.stepCredited") },
  ];
}

function resolveStage(
  t: T,
  result: VerifyDepositResult | undefined,
  isPending: boolean,
  gaveUp: boolean
): { stage: Stage; note: string; failed: boolean } {
  if (!result || isPending) {
    return { stage: "verifying", note: t("depositTimeline.checkingNote"), failed: false };
  }
  if (!("error" in result)) {
    if (result.status === "credited") {
      return { stage: "credited", note: t("depositTimeline.creditedNote", { amount: result.amount.toFixed(2) }), failed: false };
    }
    return {
      stage: "passed",
      note: t("depositTimeline.foundOnChainNote", { confirmations: result.confirmations, minConfirmations: result.minConfirmations }),
      failed: false,
    };
  }
  // not_found/rpc_error are the server's own uncertainty (a slow RPC
  // node, or a transaction that hasn't mined yet) — still actively
  // retried by the caller (see MAX_AUTO_VERIFY_RETRIES in
  // WalletDepositButton.tsx), so this stays on "verifying" rather than
  // jumping straight to a scary "failed" for something that's likely
  // to resolve fine on its own.
  if ((result.status === "not_found" || result.status === "rpc_error") && !gaveUp) {
    return { stage: "verifying", note: t("depositTimeline.stillConfirmingNote"), failed: false };
  }
  return { stage: "failed", note: result.error, failed: true };
}

export function DepositTimeline({
  txHash,
  chainLabel,
  coinSymbol = "USDT",
  knownAmount,
  result,
  isPending,
  gaveUp = false,
  mode,
}: {
  txHash: string;
  chainLabel: string;
  coinSymbol?: string;
  // The amount as the USER entered/knows it, shown immediately — for
  // the auto (deposit-from-wallet) flow this is known before the
  // server ever confirms it; for the manual paste-hash flow, nothing
  // is known until the server's own result reports a real on-chain
  // amount, so this is left undefined there and the timeline falls
  // back to the verified amount once available.
  knownAmount?: number;
  result: VerifyDepositResult | undefined;
  isPending: boolean;
  gaveUp?: boolean;
  // Changes the failed-state call to action: the auto flow (already
  // sent from the wallet, hash already known) points the user at the
  // manual box below to keep trying by hash; the manual flow IS that
  // box, so pointing back at itself would be circular — it instead
  // just asks them to double-check the hash.
  mode: "auto" | "manual";
}) {
  const { t } = useLocale();
  const { stage, note, failed } = resolveStage(t, result, isPending, gaveUp);
  const amount = knownAmount ?? (result && !("error" in result) ? result.amount : undefined);
  const STEPS = steps(t);
  const stepIndex = STEPS.findIndex((s) => s.key === stage);
  const shortHash = `${txHash.slice(0, 10)}…${txHash.slice(-6)}`;

  return (
    <div className="mt-3 rounded-xl border border-line bg-panel-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-line pb-2 text-xs">
        <span className="text-muted">
          {amount !== undefined ? <span className="font-semibold text-foreground">${amount.toFixed(2)} {coinSymbol}</span> : <span className="font-semibold text-foreground">{coinSymbol}</span>}
          {" "}{t("depositTimeline.viaLabel")} <span className="text-foreground">{chainLabel}</span>
        </span>
        <span className="font-mono text-muted">{shortHash}</span>
      </div>

      {failed ? (
        <div className="mt-3 flex items-start gap-2">
          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-risk/20 text-risk">
            <X size={12} strokeWidth={3} />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-risk">{t("depositTimeline.failedLabel")}</p>
            <p className="mt-0.5 text-xs text-risk">{note}</p>
            <p className="mt-1.5 text-xs text-muted">
              {mode === "auto"
                ? t("depositTimeline.autoFailedGuidance")
                : t("depositTimeline.manualFailedGuidance")}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-center">
            {STEPS.map((step, i) => {
              const done = i < stepIndex || stage === "credited";
              const active = i === stepIndex && stage !== "credited";
              return (
                <div key={step.key} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center gap-1">
                    <span
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${
                        done
                          ? "border-mint bg-mint/20 text-mint"
                          : active
                            ? "border-gold bg-gold-soft text-gold"
                            : "border-line bg-panel text-muted"
                      }`}
                    >
                      {done ? (
                        <Check size={13} strokeWidth={3} />
                      ) : active ? (
                        <Loader2 size={13} strokeWidth={3} className="animate-spin" />
                      ) : (
                        <Clock size={12} strokeWidth={2.5} />
                      )}
                    </span>
                    <span
                      className={`whitespace-nowrap text-[9px] font-bold uppercase tracking-wide ${
                        done ? "text-mint" : active ? "text-gold" : "text-muted"
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <span className={`mx-1 h-0.5 flex-1 rounded ${done ? "bg-mint/40" : "bg-line"}`} />
                  )}
                </div>
              );
            })}
          </div>
          <p className={`mt-2.5 text-xs ${stage === "credited" ? "text-mint" : "text-muted"}`}>{note}</p>
        </>
      )}
    </div>
  );
}
