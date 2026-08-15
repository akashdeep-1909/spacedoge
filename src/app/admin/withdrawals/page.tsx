"use client";

import { useState } from "react";
import { PaginationControls } from "@/components/PaginationControls";
import { usePagination } from "@/lib/usePagination";
import { useAdminWithdrawals, useAdminCompleteWithdrawal, useAdminSetWithdrawalFee, type AdminWithdrawalRow } from "@/lib/hooks";

export default function AdminWithdrawalsPage() {
  const { data, isLoading } = useAdminWithdrawals();
  const paged = usePagination(data?.rows ?? []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-black uppercase tracking-wide">Withdrawals</h1>
        <p className="mt-1 text-sm text-muted">
          Requesting debits the user&rsquo;s balance immediately and creates a PENDING record.
          No treasury contract exists yet, so completing one is manual: send the real on-chain
          USDT transfer yourself, then paste the resulting transaction hash below to mark it
          COMPLETED, that&rsquo;s what makes the hash appear (as a clickable block-explorer
          link) on the user&rsquo;s own withdrawal page. The network fee comes <b>out of</b> the
          requested amount (send Amount − Fee on-chain), not on top of it, fee is editable
          any time, including after completion, in case it wasn&rsquo;t known when you sent it.
        </p>
      </div>

      <div className="game-panel hud-corner overflow-hidden rounded-2xl">
        {isLoading ? (
          <p className="p-5 text-sm text-muted">Loading…</p>
        ) : !data?.rows.length ? (
          <p className="p-5 text-sm text-muted">No withdrawals yet.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {paged.pageItems.map((row) => (
                <WithdrawalRow key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        )}
      </div>
      <PaginationControls
        page={paged.page}
        pageCount={paged.pageCount}
        start={paged.start}
        pageSize={paged.pageSize}
        total={paged.total}
        onChange={paged.setPage}
      />
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  PENDING: "border-gold/25 bg-gold-soft text-gold",
  COMPLETED: "border-mint/25 bg-mint-soft text-mint",
};

const BALANCE_TYPE_LABEL: Record<string, string> = {
  RECYCLED_USDT: "Mining Earnings",
  REFERRAL_USDT: "Referral USDT",
  GAME_REWARD_USDT: "Game Reward USDT",
  AVAILABLE_DOGE: "Available DOGE",
};

function WithdrawalRow({ row }: { row: AdminWithdrawalRow }) {
  const isDoge = row.balanceType === "AVAILABLE_DOGE";
  const complete = useAdminCompleteWithdrawal();
  const setFeeMutation = useAdminSetWithdrawalFee();
  const [txHash, setTxHash] = useState("");
  const [fee, setFee] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [feeEdit, setFeeEdit] = useState(row.networkFeeUsdt !== null ? String(row.networkFeeUsdt) : "");
  const [feeEditError, setFeeEditError] = useState<string | null>(null);

  async function doComplete() {
    setError(null);
    try {
      await complete.mutateAsync({
        id: row.id,
        txHash: txHash.trim(),
        networkFeeUsdt: fee.trim() ? Number(fee) : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function doSaveFee() {
    setFeeEditError(null);
    if (!feeEdit.trim()) return;
    try {
      await setFeeMutation.mutateAsync({ id: row.id, networkFeeUsdt: Number(feeEdit) });
    } catch (err) {
      setFeeEditError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <tr className="border-b border-line align-top last:border-0">
      <td className="px-4 py-3">
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLE[row.status]}`}>
          {row.status}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-muted">
        <p className="break-all font-semibold text-foreground">{row.address}</p>
        <p className="mt-0.5">{BALANCE_TYPE_LABEL[row.balanceType] ?? row.balanceType} · {row.chain}</p>
        <p className="mt-0.5">{new Date(row.createdAt).toLocaleString()}</p>
      </td>
      <td className="px-4 py-3 text-xs">
        <p className="font-semibold text-risk">
          {isDoge ? `${Math.abs(row.amount).toFixed(4)} DOGE` : `$${Math.abs(row.amount).toFixed(2)}`}
        </p>
        {row.networkFeeUsdt !== null && (
          <p className="mt-0.5 text-mint">
            Sent: {isDoge ? `${(Math.abs(row.amount) - row.networkFeeUsdt).toFixed(4)} DOGE` : `$${(Math.abs(row.amount) - row.networkFeeUsdt).toFixed(2)}`}
          </p>
        )}
      </td>
      <td className="px-4 py-3 text-xs">
        {row.status === "COMPLETED" && row.txHash ? (
          <div className="text-muted">
            {row.explorerUrl ? (
              <a href={row.explorerUrl} target="_blank" rel="noopener noreferrer" className="break-all text-mint underline">
                {row.txHash}
              </a>
            ) : (
              <span className="break-all">{row.txHash}</span>
            )}
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide">Fee</span>
              <input
                value={feeEdit}
                onChange={(e) => setFeeEdit(e.target.value)}
                placeholder="0.0000"
                type="number"
                step="0.0001"
                className="w-24 rounded-lg border border-line bg-panel-2 px-2 py-1 text-xs"
              />
              <button
                onClick={doSaveFee}
                disabled={setFeeMutation.isPending || !feeEdit.trim()}
                className="btn-game-outline rounded-full px-2.5 py-1 text-[10px] disabled:opacity-50"
              >
                {setFeeMutation.isPending ? "Saving…" : "Save"}
              </button>
            </div>
            {feeEditError && <p className="mt-0.5 text-[11px] text-risk">{feeEditError}</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <input
              value={txHash}
              onChange={(e) => setTxHash(e.target.value)}
              placeholder="real tx hash"
              className="w-52 rounded-lg border border-line bg-panel-2 px-2 py-1 text-xs"
            />
            <input
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              placeholder="network fee (optional)"
              type="number"
              step="0.0001"
              className="w-52 rounded-lg border border-line bg-panel-2 px-2 py-1 text-xs"
            />
            <button
              onClick={doComplete}
              disabled={complete.isPending || !txHash.trim()}
              className="btn-game-outline rounded-full px-3 py-1 text-xs disabled:opacity-50"
            >
              {complete.isPending ? "Completing…" : "Mark Completed"}
            </button>
            {error && <p className="text-[11px] text-risk">{error}</p>}
          </div>
        )}
      </td>
    </tr>
  );
}
