"use client";

import { useState } from "react";
import { OnboardingGate } from "@/components/OnboardingGate";
import { PaginationControls } from "@/components/PaginationControls";
import { usePagination } from "@/lib/usePagination";
import {
  useDepositAddress,
  useMyDeposits,
  useVerifyDeposit,
  type VerifyDepositResult,
  type DepositChainInfo,
} from "@/lib/hooks";
import { copyToClipboard } from "@/lib/clipboard";
import { DepositQrCode } from "@/components/DepositQrCode";
import { WalletDepositButton } from "@/components/WalletDepositButton";
import { DEPOSIT_CAPABLE_EVM_CHAIN_IDS } from "@/lib/wagmi";
import { chainIcon } from "@/components/icons/CoinIcons";
import { useLocale } from "@/lib/i18n/LocaleProvider";

const STATUS_STYLE: Record<string, string> = {
  CREDITED: "border-mint/25 bg-mint-soft text-mint",
  PENDING: "border-gold/25 bg-gold-soft text-gold",
  UNMATCHED: "border-risk/25 bg-risk-soft text-risk",
};

// Narrows on property presence ('amount' in result), not on
// result.status equality — when a discriminated union's discriminant
// field is itself a union of literals in one branch (status: "credited"
// | "pending" here), TypeScript's control-flow narrowing doesn't fully
// exclude that branch after two sequential equality checks (confirmed
// with an isolated repro), so an 'in' check is the reliable way to
// discriminate this particular shape.
function VerifyResultMessage({ result }: { result: VerifyDepositResult }) {
  const { t } = useLocale();
  if (!("amount" in result)) {
    return <p className="mt-2 text-xs text-risk">{result.error}</p>;
  }
  if (result.status === "credited") {
    return <p className="mt-2 text-xs text-mint">✅ ${result.amount.toFixed(2)} {t("deposit.creditedMessage")}</p>;
  }
  return (
    <p className="mt-2 text-xs text-gold">
      ⏳ {t("deposit.pendingMessage", { conf: result.confirmations, min: result.minConfirmations })}
    </p>
  );
}

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
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              {chains.map((c) => (
                <button
                  key={c.chainKey}
                  onClick={() => setSelectedChainKey(c.chainKey)}
                  className={`flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                    effectiveChainKey === c.chainKey ? "border-gold bg-gold-soft text-gold" : "border-line bg-panel text-muted"
                  }`}
                >
                  {chainIcon(c.chainKey)} {c.label}
                </button>
              ))}
            </div>

            {selected && <ChainDepositPanel chain={selected} sendFromAddress={info!.sendFromAddress} />}
          </>
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

function ChainDepositPanel({ chain, sendFromAddress }: { chain: DepositChainInfo; sendFromAddress: string }) {
  const { t } = useLocale();
  const verifyDeposit = useVerifyDeposit();
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [verifyTxHash, setVerifyTxHash] = useState("");

  const isTron = chain.kind === "TRON";
  // The in-wallet deposit button needs both a numeric EVM chain id AND
  // that chain to actually be registered in wagmi's config (see
  // src/lib/wagmi.ts) — an admin can configure a DepositChainConfig row
  // for an EVM chain not in that set, it just falls back to
  // manual-address + verify-by-hash only, same as Tron.
  const canDepositFromWallet = !isTron && chain.evmChainId !== null && DEPOSIT_CAPABLE_EVM_CHAIN_IDS.has(chain.evmChainId);

  function doVerify() {
    if (!verifyTxHash.trim()) return;
    verifyDeposit.mutate({ txHash: verifyTxHash.trim(), chainKey: chain.chainKey });
  }

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
    <div className="mt-4 flex flex-col gap-3">
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
          chainLabel={chain.label}
          treasuryAddress={chain.address}
          tokenContract={chain.tokenContract}
          tokenDecimals={chain.tokenDecimals}
          minConfirmations={chain.minConfirmations}
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
            placeholder={t("deposit.txHashPlaceholder")}
            className="flex-1 rounded-lg border border-line bg-panel px-3 py-2 font-mono text-sm"
          />
          <button
            onClick={doVerify}
            disabled={verifyDeposit.isPending || !verifyTxHash.trim()}
            className="btn-game-outline shrink-0 rounded-full px-4 py-2 text-sm disabled:opacity-50"
          >
            {verifyDeposit.isPending ? t("deposit.checkingButton") : t("deposit.verifyButton")}
          </button>
        </div>
        {verifyDeposit.data && <VerifyResultMessage result={verifyDeposit.data} />}
        {verifyDeposit.isError && (
          <p className="mt-2 text-xs text-risk">
            {verifyDeposit.error instanceof Error ? verifyDeposit.error.message : t("deposit.verificationFailed")}
          </p>
        )}
      </div>
    </div>
  );
}
