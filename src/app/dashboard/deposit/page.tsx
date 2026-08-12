"use client";

import { useEffect, useState } from "react";
import { OnboardingGate } from "@/components/OnboardingGate";
import { PaginationControls } from "@/components/PaginationControls";
import { usePagination } from "@/lib/usePagination";
import {
  useDepositAddress,
  useMyDeposits,
  useVerifyDeposit,
  type DepositChainInfo,
} from "@/lib/hooks";
import { copyToClipboard } from "@/lib/clipboard";
import { DepositQrCode } from "@/components/DepositQrCode";
import { DepositTimeline } from "@/components/DepositTimeline";
import { WalletDepositButton } from "@/components/WalletDepositButton";
import { DEPOSIT_CAPABLE_EVM_CHAIN_IDS } from "@/lib/wagmi";
import { useLocale } from "@/lib/i18n/LocaleProvider";

const STATUS_STYLE: Record<string, string> = {
  CREDITED: "border-mint/25 bg-mint-soft text-mint",
  PENDING: "border-gold/25 bg-gold-soft text-gold",
  UNMATCHED: "border-risk/25 bg-risk-soft text-risk",
};

export default function DepositPage() {
  return (
    <OnboardingGate>
      <DepositContent />
    </OnboardingGate>
  );
}

function DepositContent() {
  const { t } = useLocale();
  const { data: info, isLoading } = useDepositAddress();
  const { data: deposits, isLoading: depositsLoading } = useMyDeposits();
  const depositPage = usePagination(deposits?.rows ?? []);
  const [selectedChainKey, setSelectedChainKey] = useState<string | null>(null);

  const chains = info?.chains ?? [];
  // Derived, not synced via an effect: falls back to the first chain
  // whenever nothing's been explicitly picked yet, without ever needing
  // to setState in response to `chains` loading in.
  const effectiveChainKey = selectedChainKey ?? chains[0]?.chainKey ?? null;
  const selected = chains.find((c) => c.chainKey === effectiveChainKey) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="game-panel hud-corner rounded-2xl p-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gold">⬇ {t("deposit.depositUsdtLabel")}</p>

        {isLoading ? (
          <p className="mt-4 text-sm text-muted">{t("mining.loadingLabel")}</p>
        ) : chains.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            {t("deposit.notSetUpBody")}
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted">
                {t("deposit.selectCoinLabel")}
              </p>
              {/* Only one coin is supported today (USDT) — still shown
                  as its own selected pill, not skipped entirely, since
                  the design deliberately treats coin and chain as two
                  independent choices (more coins can be added later
                  without restructuring this UI at all). */}
              <div className="flex gap-2">
                <span className="flex items-center gap-1.5 rounded-full border border-gold bg-gold-soft px-4 py-1.5 text-xs font-semibold text-gold">
                  💵 USDT
                </span>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-muted">
                {t("deposit.selectChainLabel")}
              </label>
              {/* A real <select>, not pills — everything below
                  (QR/address/deposit button) is shown immediately
                  under it for whatever's currently selected, no
                  separate step/tab to advance through. */}
              <select
                value={effectiveChainKey ?? ""}
                onChange={(e) => setSelectedChainKey(e.target.value)}
                className="w-full max-w-xs rounded-lg border border-line bg-panel px-3 py-2 text-sm font-semibold text-foreground"
              >
                {chains.map((c) => (
                  <option key={c.chainKey} value={c.chainKey}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {selected && <ChainDepositPanel chain={selected} sendFromAddress={info!.sendFromAddress} />}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-gold">▸ {t("deposit.recentDepositsHeading")}</h2>
        <div className="game-panel hud-corner overflow-hidden rounded-2xl">
          {depositsLoading ? (
            <p className="p-5 text-sm text-muted">{t("mining.loadingLabel")}</p>
          ) : !deposits?.rows.length ? (
            <p className="p-5 text-sm text-muted">{t("deposit.noDepositsYet")}</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {depositPage.pageItems.map((d) => (
                  <tr key={d.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLE[d.status]}`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold">${d.amount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {d.confirmations} {t("deposit.confSuffix")} · {d.chain}
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-muted sm:table-cell">
                      <span className="break-all">{d.txHash}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {new Date(d.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <PaginationControls
          page={depositPage.page}
          pageCount={depositPage.pageCount}
          start={depositPage.start}
          pageSize={depositPage.pageSize}
          total={depositPage.total}
          onChange={depositPage.setPage}
        />
      </div>
    </div>
  );
}

// Repeated-invalid-hash guard for the manual verify box below —
// requested explicitly: warn clearly, escalate, and point at support
// if it keeps happening, rather than silently letting someone hammer
// the verify endpoint with typos/garbage forever. This is a client-
// side, per-browser cooldown (not a server-side account ban — that's a
// meaningfully bigger, more sensitive feature: deciding what triggers
// it, how long it lasts, whether an admin needs visibility/override,
// and the real risk of a false positive locking out a genuine user).
// A temporary, self-resetting lock is a proportionate first step that
// still gives the warning real teeth (the button actually stops
// working, not just a scarier message) without that larger commitment.
// Persisted in localStorage (not just component state) so refreshing
// the page can't be used to dodge it.
const INVALID_ATTEMPT_THRESHOLD = 3;
const COOLDOWN_MS = 60_000;

function useInvalidHashGuard(chainKey: string) {
  const attemptsKey = `spacedoge:deposit-invalid-attempts:${chainKey}`;
  const lockKey = `spacedoge:deposit-verify-locked-until:${chainKey}`;
  const [attempts, setAttempts] = useState(0);
  // A plain countdown of whole seconds, not a `lockedUntil` timestamp
  // read against Date.now() at render time — React's render-purity
  // rule flags calling Date.now() directly in the render path (it'd
  // make the component's output non-deterministic between renders for
  // reasons React can't track). Date.now() is only ever read below
  // inside genuine effect/event-handler contexts (the mount-restore
  // effect, and recordInvalidAttempt), never in the render body itself
  // — remainingSeconds is just decremented by 1 every tick from there.
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  useEffect(() => {
    try {
      const storedAttempts = Number(window.localStorage.getItem(attemptsKey)) || 0;
      const storedLockUntil = Number(window.localStorage.getItem(lockKey)) || 0;
      const remaining = storedLockUntil > Date.now() ? Math.ceil((storedLockUntil - Date.now()) / 1000) : 0;
      if (!remaining && storedLockUntil) window.localStorage.removeItem(lockKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time sync from localStorage, same justification as WalletDepositButton.tsx's own pendingTxHash restore effect (SSR/hydration: reading localStorage during render itself would mismatch the server pass)
      setAttempts(storedAttempts);
      setRemainingSeconds(remaining);
    } catch {
      // Private browsing / storage disabled — guard just runs in-memory
      // for this page load only, which is still better than nothing.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only restore
  }, []);

  // Runs only while actually locked (the boolean dependency below only
  // flips when remainingSeconds crosses the 0 boundary, so this doesn't
  // tear down and recreate the interval every single tick) — a plain
  // decrement via the functional updater form, no Date.now() involved
  // at all here.
  useEffect(() => {
    if (remainingSeconds <= 0) return;
    const id = setInterval(() => {
      setRemainingSeconds((s) => {
        const next = s - 1;
        if (next <= 0) {
          try {
            window.localStorage.removeItem(lockKey);
          } catch {
            // non-fatal
          }
        }
        return Math.max(0, next);
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lockKey is derived from the stable chainKey prop; only the locked/unlocked transition (not the exact second) determines whether this effect should be running at all
  }, [remainingSeconds > 0]);

  function recordInvalidAttempt() {
    const next = attempts + 1;
    setAttempts(next);
    try {
      window.localStorage.setItem(attemptsKey, String(next));
    } catch {
      // non-fatal
    }
    if (next >= INVALID_ATTEMPT_THRESHOLD) {
      setAttempts(0);
      setRemainingSeconds(Math.ceil(COOLDOWN_MS / 1000));
      try {
        window.localStorage.setItem(lockKey, String(Date.now() + COOLDOWN_MS));
        window.localStorage.removeItem(attemptsKey);
      } catch {
        // non-fatal
      }
    }
  }

  function recordSuccess() {
    setAttempts(0);
    try {
      window.localStorage.removeItem(attemptsKey);
    } catch {
      // non-fatal
    }
  }

  return { attempts, isLocked: remainingSeconds > 0, remainingSeconds, recordInvalidAttempt, recordSuccess };
}

// Result statuses that mean "this specific hash is genuinely wrong" —
// worth counting against the guard above. not_found/rpc_error are
// deliberately excluded: those are the SERVER's own uncertainty (an
// RPC node lagging, or a transaction that hasn't mined yet), not proof
// the user did anything wrong, so they shouldn't count as a strike.
function isDefinitivelyInvalid(status: string): boolean {
  return ["invalid_hash", "no_matching_transfer", "failed_tx", "sent_from_different_wallet"].includes(status);
}

function ChainDepositPanel({ chain, sendFromAddress }: { chain: DepositChainInfo; sendFromAddress: string }) {
  const { t } = useLocale();
  const verifyDeposit = useVerifyDeposit();
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [verifyTxHash, setVerifyTxHash] = useState("");
  const [lastVerifiedHash, setLastVerifiedHash] = useState<string | null>(null);
  const guard = useInvalidHashGuard(chain.chainKey);

  const isTron = chain.kind === "TRON";
  // The in-wallet deposit button needs both a numeric EVM chain id AND
  // that chain to actually be registered in wagmi's config (see
  // src/lib/wagmi.ts) — an admin can configure a DepositChainConfig row
  // for an EVM chain not in that set, it just falls back to
  // manual-address + verify-by-hash only, same as Tron.
  const canDepositFromWallet = !isTron && chain.evmChainId !== null && DEPOSIT_CAPABLE_EVM_CHAIN_IDS.has(chain.evmChainId);

  function doVerify() {
    if (!verifyTxHash.trim() || guard.isLocked) return;
    const hash = verifyTxHash.trim();
    setLastVerifiedHash(hash);
    verifyDeposit.mutate({ txHash: hash, chainKey: chain.chainKey, source: "manual" });
  }

  // Feeds the result of every manual verify attempt into the anti-abuse
  // guard the moment it lands — a real network round trip, so this
  // can't just live inline in doVerify() above.
  useEffect(() => {
    const result = verifyDeposit.data;
    if (!result || !lastVerifiedHash) return;
    if (!("error" in result)) {
      guard.recordSuccess();
      return;
    }
    if (isDefinitivelyInvalid(result.status)) {
      guard.recordInvalidAttempt();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per new verifyDeposit.data value; guard's own functions are stable enough for this purpose, including them would re-run this on every guard-state tick
  }, [verifyDeposit.data, lastVerifiedHash]);

  async function copyAddress() {
    if (!chain.address) return;
    setCopyError(null);
    const ok = await copyToClipboard(chain.address);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      setCopyError(`${t("deposit.copyErrorPrefix")} ${chain.address}`);
    }
  }

  // The admin's address pool for this chain is fully assigned to other
  // users already — see AdminDepositAddressRow / getOrAssignDepositAddress
  // — rather than the far more common "no chain configured at all" case
  // above. Shown instead of the QR/copy/deposit-button flow entirely,
  // since there's no address to show.
  if (!chain.address) {
    return (
      <div className="mt-4 rounded-xl border border-risk/25 bg-risk-soft p-3 text-xs text-risk">
        {t("deposit.noAddressAvailableBody")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <DepositQrCode value={chain.address} />
        <div className="flex-1">
          <p className="mb-1 text-xs text-muted">{t("deposit.sendUsdtHint", { chain: chain.label })}</p>
          <div className="flex items-center gap-2 rounded-xl border border-line bg-panel-2 px-3 py-2">
            <code className="flex-1 break-all text-sm">{chain.address}</code>
            <button onClick={copyAddress} className="btn-game-outline shrink-0 rounded-full px-3 py-1.5 text-xs">
              {copied ? t("deposit.copiedLabel") : t("deposit.copyLabel")}
            </button>
          </div>
          {copyError && <p className="mt-1 text-xs text-risk">{copyError}</p>}
        </div>
      </div>

      {canDepositFromWallet && (
        <WalletDepositButton
          chainId={chain.evmChainId!}
          chainKey={chain.chainKey}
          chainLabel={chain.label}
          treasuryAddress={chain.address}
          tokenContract={chain.tokenContract}
          tokenDecimals={chain.tokenDecimals}
        />
      )}

      {isTron ? (
        <div className="rounded-xl border border-gold/25 bg-gold-soft p-3 text-xs text-gold">
          <p>{t("deposit.tronNoticeBody")}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-risk/25 bg-risk-soft p-3 text-xs text-risk">
          <p>{t("deposit.evmNoticeBody", { chain: chain.label, address: sendFromAddress })}</p>
          <p className="mt-1">{t("deposit.evmNoticeBody2")}</p>
        </div>
      )}

      <p className="text-xs text-muted">
        {isTron
          ? t("deposit.tronCreditTiming")
          : `${t("deposit.evmCreditTiming", { n: chain.minConfirmations })} ${t("deposit.trackStatusBelow")}`}
      </p>

      <div className="rounded-xl border border-line bg-panel-2 p-3">
        <p className="text-xs font-bold uppercase tracking-widest text-gold">{t("deposit.alreadySentLabel")}</p>
        <p className="mt-1 text-xs text-muted">
          {t("deposit.alreadySentBody")}
        </p>
        <div className="mt-2 flex gap-2">
          <input
            value={verifyTxHash}
            onChange={(e) => setVerifyTxHash(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doVerify()}
            disabled={guard.isLocked}
            placeholder={t("deposit.txHashPlaceholder")}
            className="flex-1 rounded-lg border border-line bg-panel px-3 py-2 font-mono text-sm disabled:opacity-50"
          />
          <button
            onClick={doVerify}
            disabled={verifyDeposit.isPending || !verifyTxHash.trim() || guard.isLocked}
            className="btn-game-outline shrink-0 rounded-full px-4 py-2 text-sm disabled:opacity-50"
          >
            {verifyDeposit.isPending ? t("deposit.checkingButton") : t("deposit.verifyButton")}
          </button>
        </div>

        {guard.isLocked ? (
          <p className="mt-2 text-xs text-risk">
            {t("deposit.tooManyInvalidAttempts", { s: guard.remainingSeconds })}
            <br />
            {t("deposit.contactSupportHint")}
          </p>
        ) : (
          <>
            {verifyDeposit.isError && (
              <p className="mt-2 text-xs text-risk">
                {verifyDeposit.error instanceof Error ? verifyDeposit.error.message : t("deposit.verificationFailed")}
              </p>
            )}
            {verifyDeposit.data && lastVerifiedHash && (
              <>
                <DepositTimeline
                  txHash={lastVerifiedHash}
                  chainLabel={chain.label}
                  result={verifyDeposit.data}
                  isPending={verifyDeposit.isPending}
                  mode="manual"
                />
                {"error" in verifyDeposit.data &&
                  isDefinitivelyInvalid(verifyDeposit.data.status) &&
                  guard.attempts > 0 && (
                    <p className="mt-2 text-xs text-gold">{t("deposit.invalidHashWarning")}</p>
                  )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
