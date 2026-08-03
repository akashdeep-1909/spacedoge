"use client";

import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import type { Hex } from "viem";
import { useReserveProof } from "@/lib/hooks";
import { hashLeaf, verifyProof, traceProof, scaleBalance, type TraceStep } from "@/lib/merkle";
import { InfoTooltip } from "@/components/InfoTooltip";
import { useLocale, type TranslationKey } from "@/lib/i18n/LocaleProvider";

function shortHash(h: string) {
  return `${h.slice(0, 8)}…${h.slice(-6)}`;
}

// One row of the path diagram — shows the two hashes that combined at
// this level, ordered left/right by their real structural position
// (TraceStep.currentIsLeft, see src/lib/merkle.ts), with "your path"
// highlighted and the other side labeled only as a generic "Sibling" —
// never attributed to any other wallet, since neither this component
// nor the server has (or needs) any other wallet's identity to draw
// this. Only the ONE path belonging to the signed-in wallet is ever
// rendered here.
function TreeStepRow({ step, t }: { step: TraceStep; t: (key: TranslationKey) => string }) {
  const leftHash = step.currentIsLeft ? step.currentHash : step.siblingHash;
  const rightHash = step.currentIsLeft ? step.siblingHash : step.currentHash;
  return (
    <div className="flex items-center gap-1.5 font-mono text-[10px]">
      <span
        className={`rounded border px-2 py-1 ${
          step.currentIsLeft ? "border-mint/30 bg-mint-soft text-mint" : "border-line bg-panel-2 text-muted"
        }`}
      >
        {step.currentIsLeft ? t("wallet.reserveProofYourPathLabel") : t("wallet.reserveProofSiblingLabel")}:{" "}
        {shortHash(leftHash)}
      </span>
      <span className="text-muted">+</span>
      <span
        className={`rounded border px-2 py-1 ${
          !step.currentIsLeft ? "border-mint/30 bg-mint-soft text-mint" : "border-line bg-panel-2 text-muted"
        }`}
      >
        {!step.currentIsLeft ? t("wallet.reserveProofYourPathLabel") : t("wallet.reserveProofSiblingLabel")}:{" "}
        {shortHash(rightHash)}
      </span>
    </div>
  );
}

// Recomputes this wallet's own leaf hash and walks its Merkle proof up
// to the root ENTIRELY client-side (src/lib/merkle.ts has no `db`
// import — the exact same hashLeaf/verifyProof the server used to
// self-check the snapshot before publishing it). No server trust is
// needed for this specific check: if it says Verified, the arithmetic
// really does work out against the publicly-shown root. traceProof
// additionally recovers every intermediate combine step so the path
// can be drawn — still only this wallet's own leaf/position, never
// anyone else's balance or address.
export function ReserveProofCard() {
  const { t } = useLocale();
  const { data: proof, isLoading } = useReserveProof();
  const [verifyState, setVerifyState] = useState<"idle" | "verified" | "failed">("idle");
  const [trace, setTrace] = useState<{ steps: TraceStep[]; leafHash: Hex; computedRoot: Hex } | null>(null);

  function handleVerify() {
    if (!proof) return;
    const leafHash = hashLeaf(proof.address, scaleBalance(proof.balanceUsdt), proof.nonce as Hex);
    const ok = verifyProof(leafHash, proof.proof as Hex[], proof.merkleRoot as Hex);
    const { steps, computedRoot } = traceProof(leafHash, proof.proof as Hex[], proof.leafIndex, proof.totalLeafCount);
    setTrace({ steps, leafHash, computedRoot });
    setVerifyState(ok ? "verified" : "failed");
  }

  return (
    <section>
      <h3 className="mb-3 flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.2em] text-mint">
        ▸ {t("wallet.reserveProofHeading")}
        <InfoTooltip text={t("wallet.reserveProofTooltip")} />
      </h3>
      <div className="game-panel hud-corner rounded-2xl p-5">
        {isLoading ? (
          <p className="text-sm text-muted">{t("mining.loadingLabel")}</p>
        ) : !proof ? (
          <>
            <p className="text-sm text-muted">{t("wallet.reserveProofNone")}</p>
            <p className="mt-2 text-xs leading-relaxed text-muted">{t("wallet.reserveProofNoneNextStep")}</p>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted">
                  {t("wallet.reserveProofBalanceLabel")}
                </p>
                <p className="stat-value mt-1 text-xl">
                  ${proof.balanceUsdt.toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
                  <span className="text-sm text-muted">USDT</span>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={handleVerify}
                  className="btn-game-outline hud-corner rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide"
                >
                  {t("wallet.reserveProofVerifyButton")}
                </button>
              </div>
            </div>
            {verifyState === "verified" && (
              <p className="mt-3 flex items-center gap-1.5 text-sm font-bold text-mint">
                <CheckCircle2 size={16} /> {t("wallet.reserveProofVerified")}
              </p>
            )}
            {verifyState === "failed" && (
              <p className="mt-3 flex items-center gap-1.5 text-sm font-bold text-risk">
                <XCircle size={16} /> {t("wallet.reserveProofFailed")}
              </p>
            )}

            {/* Path visualization — only this wallet's own leaf and its
                path to the root; sibling hashes are labeled generically,
                never as another wallet's data (there is none to show —
                see TreeStepRow's own doc-comment). */}
            {trace && (
              <div className="mt-4 rounded-lg border border-line bg-panel-2/40 p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted">
                  {t("wallet.reserveProofTreeHeading")}
                </p>
                <div className="mt-2 flex flex-col items-start gap-2">
                  <span className="rounded border border-mint/30 bg-mint-soft px-2 py-1 font-mono text-[10px] text-mint">
                    {t("wallet.reserveProofYourLeafLabel")}: {shortHash(trace.leafHash)}
                  </span>
                  {trace.steps.map((step, i) => (
                    <div key={i} className="flex items-center gap-2 pl-2">
                      <span className="text-muted">↓</span>
                      <TreeStepRow step={step} t={t} />
                    </div>
                  ))}
                  <span className="text-muted pl-2">↓</span>
                  <span
                    className={`rounded border px-2 py-1 font-mono text-[10px] ${
                      verifyState === "verified"
                        ? "border-gold/30 bg-gold-soft text-gold"
                        : "border-risk/30 bg-risk-soft text-risk"
                    }`}
                  >
                    {t("wallet.reserveProofRootLabel")}: {shortHash(trace.computedRoot)}
                  </span>
                </div>
              </div>
            )}

            <p className="mt-3 font-mono text-[11px] text-muted">
              {t("wallet.reserveProofRootLabel")}: {shortHash(proof.merkleRoot)}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
