"use client";

import { useEffect, useRef, useState } from "react";
import {
  useAdminSettings,
  useUpdateAdminSettings,
  useAdminUserList,
  useAddAdminUser,
  useRemoveAdminUser,
  useAdminDepositChains,
  useAddDepositChain,
  useUpdateDepositChain,
  useDeleteDepositChain,
  useAddDepositAddresses,
  useDeleteDepositAddress,
  useAdminWithdrawChains,
  useAddWithdrawChain,
  useUpdateWithdrawChain,
  useDeleteWithdrawChain,
  useAdminGameModes,
  useUpdateGameModeConfig,
  type AdminDepositChainRow,
  type AdminWithdrawChainRow,
  type AdminGameModeRow,
} from "@/lib/hooks";
import { chainIcon, coinIcon } from "@/components/icons/CoinIcons";

export default function AdminSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-black uppercase tracking-wide">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Platform-wide configuration, deposit chains, withdrawal chains/coins, admin access,
          and public social links. Changes take effect immediately, no redeploy needed.
        </p>
      </div>

      <GameModesSection />
      <DepositChainsSection />
      <WithdrawChainsSection />
      <WithdrawalPolicySection />
      <WeeklyLeaderboardSection />
      <WalletConnectSection />
      <AdminUsersSection />
      <SocialSection />
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

const inputClass = "w-full rounded-lg border border-line bg-panel-2 px-3 py-2 font-mono text-sm";
const plainInputClass = "w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm";

// ---------------------------------------------------------------------
// Game Modes — GameModeConfig, one row per fixed GameMode enum value
// (no add/delete — the mode set itself is fixed, only its parameters
// are editable, see the scope-boundary note in prisma/schema.prisma's
// GameModeConfig doc comment). Sponsored Drop/Weekly Forge Cup get
// extra fields: prefunded pool, re-entry cooldown, and the activity-
// eligibility gate (a wallet needs N plays in the last N hours to even
// see the mode — src/lib/gameModes.ts checkPromoEligibility()).
// ---------------------------------------------------------------------

const PROMO_MODES = new Set(["SPONSORED_DROP", "FORGE_CUP"]);

function GameModesSection() {
  const { data, isLoading } = useAdminGameModes();

  return (
    <section className="game-panel hud-corner rounded-2xl p-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gold">Game Modes</p>
      <p className="mt-1 text-xs text-muted">
        Entry fee, duration, label/description, and enabled state for every mode. Sponsored Drop
        and Weekly Forge Cup also get a prefunded pool amount, a re-entry cooldown, and an
        activity gate (minimum matches played in a recent window before the mode is even shown).
      </p>
      <div className="mt-4 flex flex-col gap-3">
        {isLoading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          data?.rows.map((row) => <GameModeRow key={row.id} row={row} />)
        )}
      </div>
    </section>
  );
}

function GameModeRow({ row }: { row: AdminGameModeRow }) {
  const update = useUpdateGameModeConfig();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(row.label);
  const [description, setDescription] = useState(row.description);
  const [entryFeeUsdt, setEntryFeeUsdt] = useState(String(row.entryFeeUsdt));
  const [durationSec, setDurationSec] = useState(String(row.durationSec));
  const [prefundedPoolUsdt, setPrefundedPoolUsdt] = useState(String(row.prefundedPoolUsdt ?? ""));
  const [cooldownHours, setCooldownHours] = useState(String(row.cooldownHours ?? ""));
  const [eligibilityWindowHours, setEligibilityWindowHours] = useState(String(row.eligibilityWindowHours ?? ""));
  const [eligibilityMinPlays, setEligibilityMinPlays] = useState(String(row.eligibilityMinPlays ?? ""));
  const [error, setError] = useState<string | null>(null);

  const isPromo = PROMO_MODES.has(row.mode);

  async function toggleEnabled() {
    setError(null);
    try {
      await update.mutateAsync({ id: row.id, enabled: !row.enabled });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function saveEdit() {
    setError(null);
    try {
      await update.mutateAsync({
        id: row.id,
        label: label.trim(),
        description: description.trim(),
        entryFeeUsdt: Number(entryFeeUsdt) || 0,
        durationSec: Number(durationSec) || row.durationSec,
        ...(isPromo
          ? {
              prefundedPoolUsdt: prefundedPoolUsdt.trim() === "" ? null : Number(prefundedPoolUsdt),
              cooldownHours: cooldownHours.trim() === "" ? null : Number(cooldownHours),
              eligibilityWindowHours: eligibilityWindowHours.trim() === "" ? null : Number(eligibilityWindowHours),
              eligibilityMinPlays: eligibilityMinPlays.trim() === "" ? null : Number(eligibilityMinPlays),
            }
          : {}),
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  return (
    <div className="rounded-xl border border-line bg-panel-2 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {row.label}
            <span className="rounded-full border border-line px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted">{row.mode}</span>
            {isPromo && (
              <span className="rounded-full border border-gold/30 bg-gold-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-gold">Promo</span>
            )}
            {!row.enabled && <span className="rounded-full border border-risk/40 bg-risk-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-risk">Disabled</span>}
          </p>
          <p className="mt-1 text-xs text-muted">{row.description}</p>
          <p className="mt-1 text-xs text-muted">
            {row.entryFeeUsdt} USDT · {row.durationSec}s
            {isPromo && (
              <>
                {" "}· {row.prefundedPoolUsdt ?? 0} USDT pool · {row.cooldownHours ?? 0}h cooldown ·{" "}
                {row.eligibilityMinPlays ?? 0}+ plays in {row.eligibilityWindowHours ?? 0}h to unlock
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button onClick={() => setEditing((v) => !v)} className="rounded-full border border-line px-3 py-1 text-[11px] text-muted hover:text-foreground">
            {editing ? "Cancel" : "Edit"}
          </button>
          <button
            onClick={toggleEnabled}
            disabled={update.isPending}
            className="rounded-full border border-line px-3 py-1 text-[11px] text-muted hover:text-foreground disabled:opacity-50"
          >
            {row.enabled ? "Disable" : "Enable"}
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-2">
          <Field label="Label">
            <input value={label} onChange={(e) => setLabel(e.target.value)} className={plainInputClass} />
          </Field>
          <Field label="Description">
            <input value={description} onChange={(e) => setDescription(e.target.value)} className={plainInputClass} />
          </Field>
          <Field label="Entry fee (USDT)">
            <input type="number" min="0" step="0.01" value={entryFeeUsdt} onChange={(e) => setEntryFeeUsdt(e.target.value)} className={plainInputClass} />
          </Field>
          <Field label="Duration (seconds)">
            <input type="number" min="10" max="600" value={durationSec} onChange={(e) => setDurationSec(e.target.value)} className={plainInputClass} />
          </Field>
          {isPromo && (
            <>
              <Field label="Prefunded pool (USDT)">
                <input type="number" min="0" step="0.01" value={prefundedPoolUsdt} onChange={(e) => setPrefundedPoolUsdt(e.target.value)} className={plainInputClass} />
              </Field>
              <Field label="Re-entry cooldown (hours)">
                <input type="number" min="0" value={cooldownHours} onChange={(e) => setCooldownHours(e.target.value)} className={plainInputClass} />
              </Field>
              <Field label="Eligibility window (hours)" hint="lookback window for the activity check">
                <input type="number" min="1" value={eligibilityWindowHours} onChange={(e) => setEligibilityWindowHours(e.target.value)} className={plainInputClass} />
              </Field>
              <Field label="Eligibility min plays" hint="matches needed in that window to unlock this mode">
                <input type="number" min="1" value={eligibilityMinPlays} onChange={(e) => setEligibilityMinPlays(e.target.value)} className={plainInputClass} />
              </Field>
            </>
          )}
          <button onClick={saveEdit} disabled={update.isPending} className="btn-game-outline rounded-full px-4 py-1.5 text-xs disabled:opacity-50 sm:col-span-2 sm:w-fit">
            {update.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-risk">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------
// Deposit Chains — DepositChainConfig CRUD (replaces the old single-
// BEP20 Treasury section)
// ---------------------------------------------------------------------

function DepositChainsSection() {
  const { data, isLoading } = useAdminDepositChains();
  const [showAdd, setShowAdd] = useState(false);

  return (
    <section className="game-panel hud-corner rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gold">Deposit Chains</p>
          <p className="mt-1 text-xs text-muted">
            Multi-chain. Each chain has a POOL of addresses, users are automatically split
            across whichever addresses exist (1 address = everyone sees it, 2 = roughly half
            each, 3 = roughly a third each, and so on), add or remove addresses any time and
            the split adjusts itself. EVM chains (BEP20 and any other you add) are auto-detected
            and auto-credited by a live watcher regardless of which pool address a deposit lands
            on, matching is by the SENDER&rsquo;s wallet, not the receiving address. TRON chains
            (TRC20) are detected live too, but this app has no way to link a user&rsquo;s Tron
            wallet to their account yet, Tron deposits always need an admin&rsquo;s manual
            assign on the Deposits tab, they never self-credit.
          </p>
        </div>
        <button onClick={() => setShowAdd((v) => !v)} className="btn-game-outline shrink-0 rounded-full px-4 py-1.5 text-xs">
          {showAdd ? "Cancel" : "+ Add Chain"}
        </button>
      </div>

      {showAdd && <AddDepositChainForm onDone={() => setShowAdd(false)} />}

      <div className="mt-4 flex flex-col gap-3">
        {isLoading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : !data?.rows.length ? (
          <p className="text-sm text-muted">No deposit chains configured.</p>
        ) : (
          data.rows.map((row) => <DepositChainRow key={row.id} row={row} />)
        )}
      </div>
    </section>
  );
}

function AddDepositChainForm({ onDone }: { onDone: () => void }) {
  const add = useAddDepositChain();
  const [chainKey, setChainKey] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"EVM" | "TRON">("EVM");
  const [addressesText, setAddressesText] = useState("");
  const [tokenContract, setTokenContract] = useState("");
  const [tokenDecimals, setTokenDecimals] = useState(kind === "EVM" ? "18" : "6");
  const [minConfirmations, setMinConfirmations] = useState("15");
  const [rpcUrl, setRpcUrl] = useState("");
  const [evmChainId, setEvmChainId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const addresses = addressesText
    .split(/[\n,]/)
    .map((a) => a.trim())
    .filter(Boolean);

  async function submit() {
    setError(null);
    try {
      await add.mutateAsync({
        chainKey: chainKey.trim().toUpperCase(),
        label: label.trim(),
        kind,
        addresses,
        tokenContract: tokenContract.trim(),
        tokenDecimals: Number(tokenDecimals),
        minConfirmations: Number(minConfirmations),
        rpcUrl: kind === "EVM" ? rpcUrl.trim() || null : null,
        evmChainId: kind === "EVM" && evmChainId.trim() ? Number(evmChainId) : null,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add chain");
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-line bg-panel-2 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Chain key" hint="Uppercase, e.g. POLYGON">
          <input value={chainKey} onChange={(e) => setChainKey(e.target.value)} placeholder="POLYGON" className={inputClass} />
        </Field>
        <Field label="Display label">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Polygon" className={inputClass} />
        </Field>
        <Field label="Kind">
          <select
            value={kind}
            onChange={(e) => {
              const k = e.target.value as "EVM" | "TRON";
              setKind(k);
              setTokenDecimals(k === "EVM" ? "18" : "6");
            }}
            className={inputClass}
          >
            <option value="EVM">EVM (Ethereum, BSC, Polygon, …)</option>
            <option value="TRON">TRON (TRC20)</option>
          </select>
        </Field>
        <Field label="USDT token contract">
          <input value={tokenContract} onChange={(e) => setTokenContract(e.target.value)} placeholder={kind === "EVM" ? "0x…" : "T…"} className={inputClass} />
        </Field>
        <Field
          label={`Starting deposit addresses (${addresses.length})`}
          hint="One per line (or comma-separated), users are split evenly across all of them automatically. Add more later any time."
        >
          <textarea
            value={addressesText}
            onChange={(e) => setAddressesText(e.target.value)}
            placeholder={kind === "EVM" ? "0xabc…\n0xdef…" : "Tabc…\nTdef…"}
            rows={4}
            className={`${inputClass} font-mono`}
          />
        </Field>
        <Field label="Token decimals">
          <input type="number" value={tokenDecimals} onChange={(e) => setTokenDecimals(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Min confirmations" hint={kind === "TRON" ? "Unused for Tron, it uses TronGrid's own finality flag" : undefined}>
          <input type="number" value={minConfirmations} onChange={(e) => setMinConfirmations(e.target.value)} className={inputClass} />
        </Field>
        {kind === "EVM" && (
          <>
            <Field label="RPC URL" hint="Blank falls back to a free public RPC for well-known chain IDs (1=Ethereum, 56=BSC, 137=Polygon), required for anything else">
              <input value={rpcUrl} onChange={(e) => setRpcUrl(e.target.value)} placeholder="https://…" className={inputClass} />
            </Field>
            <Field
              label="EVM chain ID"
              hint="56=BSC, 137=Polygon, 1=Ethereum. Needed for the in-wallet deposit button, without it (or for an unregistered chain id) users can still deposit by copying the address or pasting a tx hash to verify."
            >
              <input type="number" value={evmChainId} onChange={(e) => setEvmChainId(e.target.value)} placeholder="56" className={inputClass} />
            </Field>
          </>
        )}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={add.isPending || !chainKey.trim() || !label.trim() || addresses.length === 0 || !tokenContract.trim()}
          className="btn-game-outline rounded-full px-4 py-1.5 text-xs disabled:opacity-50"
        >
          {add.isPending ? "Adding…" : "Add Chain"}
        </button>
        {error && <span className="text-xs text-risk">{error}</span>}
      </div>
    </div>
  );
}

function DepositChainRow({ row }: { row: AdminDepositChainRow }) {
  const update = useUpdateDepositChain();
  const del = useDeleteDepositChain();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(row.label);
  const [tokenContract, setTokenContract] = useState(row.tokenContract);
  const [tokenDecimals, setTokenDecimals] = useState(String(row.tokenDecimals));
  const [minConfirmations, setMinConfirmations] = useState(String(row.minConfirmations));
  const [evmChainId, setEvmChainId] = useState(row.evmChainId !== null ? String(row.evmChainId) : "");
  const [error, setError] = useState<string | null>(null);

  async function toggleEnabled() {
    setError(null);
    try {
      await update.mutateAsync({ id: row.id, enabled: !row.enabled });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function saveEdit() {
    setError(null);
    try {
      await update.mutateAsync({
        id: row.id,
        label: label.trim(),
        tokenContract: tokenContract.trim(),
        tokenDecimals: Number(tokenDecimals),
        minConfirmations: Number(minConfirmations),
        evmChainId: row.kind === "EVM" && evmChainId.trim() ? Number(evmChainId) : null,
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  async function doDelete() {
    if (!confirm(`Remove ${row.label}? Historical deposit records keep their chain key but stop being scanned.`)) return;
    setError(null);
    try {
      await del.mutateAsync(row.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <div className="rounded-xl border border-line bg-panel-2 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold">
            {chainIcon(row.chainKey)} {row.label}
            <span className="rounded-full border border-line px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted">{row.chainKey}</span>
            <span className="rounded-full border border-line px-1.5 py-0.5 text-[10px] uppercase text-muted">{row.kind}</span>
            {!row.enabled && <span className="rounded-full border border-risk/40 bg-risk-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-risk">Disabled</span>}
          </p>
          <p className="mt-1 break-all font-mono text-xs text-muted">contract: {row.tokenContract}</p>
          <p className="mt-0.5 text-xs text-muted">
            {row.tokenDecimals} decimals · {row.kind === "EVM" ? `${row.minConfirmations} confirmations` : "TronGrid finality"}
          </p>
          <p className="mt-0.5 text-xs text-mint">
            {row.addresses.length === 0
              ? "No deposit addresses yet"
              : row.addresses.length === 1
                ? "1 address, every user sees this one"
                : `${row.addresses.length} addresses, users split roughly evenly across all of them`}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button onClick={() => setEditing((v) => !v)} className="rounded-full border border-line px-3 py-1 text-[11px] text-muted hover:text-foreground">
            {editing ? "Cancel" : "Edit"}
          </button>
          <button
            onClick={toggleEnabled}
            disabled={update.isPending}
            className="rounded-full border border-line px-3 py-1 text-[11px] text-muted hover:text-foreground disabled:opacity-50"
          >
            {row.enabled ? "Disable" : "Enable"}
          </button>
          <button
            onClick={doDelete}
            disabled={del.isPending}
            className="rounded-full border border-risk/40 px-3 py-1 text-[11px] font-semibold text-risk hover:bg-risk-soft disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-4">
          <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass} placeholder="Display label" />
          <input value={tokenContract} onChange={(e) => setTokenContract(e.target.value)} className={inputClass} placeholder="Token contract" />
          <input type="number" value={tokenDecimals} onChange={(e) => setTokenDecimals(e.target.value)} className={inputClass} placeholder="Token decimals" />
          <input type="number" value={minConfirmations} onChange={(e) => setMinConfirmations(e.target.value)} className={inputClass} placeholder="Min confirmations" />
          {row.kind === "EVM" && (
            <input
              type="number"
              value={evmChainId}
              onChange={(e) => setEvmChainId(e.target.value)}
              className={inputClass}
              placeholder="EVM chain ID (56=BSC, 1=Ethereum)"
            />
          )}
          <button
            onClick={saveEdit}
            disabled={update.isPending || !label.trim()}
            className="btn-game-outline rounded-full px-4 py-1.5 text-xs disabled:opacity-50 sm:col-span-4 sm:w-fit"
          >
            {update.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-risk">{error}</p>}

      <AddressPoolSection chain={row} />
    </div>
  );
}

// The address pool for one chain — users are split across every
// address here automatically (see getDepositAddressForWallet in
// src/lib/deposits.ts), so managing it is just add/delete.
function AddressPoolSection({ chain }: { chain: AdminDepositChainRow }) {
  const addAddresses = useAddDepositAddresses();
  const deleteAddress = useDeleteDepositAddress();
  const [expanded, setExpanded] = useState(false);
  const [newAddressesText, setNewAddressesText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const newAddresses = newAddressesText
    .split(/[\n,]/)
    .map((a) => a.trim())
    .filter(Boolean);

  async function submitNew() {
    setError(null);
    try {
      await addAddresses.mutateAsync({ chainId: chain.id, addresses: newAddresses });
      setNewAddressesText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add addresses");
    }
  }

  async function removeAddress(addressId: string) {
    if (!confirm("Remove this address from the pool? Any user currently split onto it will be moved onto a different one next time they check.")) return;
    setError(null);
    try {
      await deleteAddress.mutateAsync({ chainId: chain.id, addressId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove address");
    }
  }

  return (
    <div className="mt-3 border-t border-line pt-3">
      <button onClick={() => setExpanded((v) => !v)} className="text-[11px] font-semibold text-mint hover:underline">
        {expanded ? "▾ Hide address pool" : "▸ Manage address pool"}
      </button>

      {expanded && (
        <div className="mt-2 flex flex-col gap-2">
          {chain.addresses.length === 0 ? (
            <p className="text-xs text-muted">No addresses in this chain&rsquo;s pool yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {chain.addresses.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5">
                  <p className="min-w-0 break-all font-mono text-xs">{a.address}</p>
                  <button
                    onClick={() => removeAddress(a.id)}
                    disabled={deleteAddress.isPending}
                    className="shrink-0 rounded-full border border-risk/40 px-2 py-0.5 text-[10px] font-semibold text-risk hover:bg-risk-soft disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-1 flex flex-col gap-1.5 sm:flex-row sm:items-start">
            <textarea
              value={newAddressesText}
              onChange={(e) => setNewAddressesText(e.target.value)}
              placeholder={chain.kind === "EVM" ? "Add more: 0xabc…\n0xdef…" : "Add more: Tabc…\nTdef…"}
              rows={2}
              className={`${inputClass} flex-1 font-mono`}
            />
            <button
              onClick={submitNew}
              disabled={addAddresses.isPending || newAddresses.length === 0}
              className="btn-game-outline shrink-0 rounded-full px-3 py-1.5 text-xs disabled:opacity-50"
            >
              {addAddresses.isPending ? "Adding…" : `+ Add ${newAddresses.length || ""}`.trim()}
            </button>
          </div>
          {error && <p className="text-xs text-risk">{error}</p>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Withdrawal Chains & Coins — WithdrawChainConfig CRUD
// ---------------------------------------------------------------------

function WithdrawChainsSection() {
  const { data, isLoading } = useAdminWithdrawChains();
  const [showAdd, setShowAdd] = useState(false);

  return (
    <section className="game-panel hud-corner rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gold">Withdrawal Chains &amp; Coins</p>
          <p className="mt-1 text-xs text-muted">
            Every destination a user can withdraw to. USDT chains let the user pick Recycled or
            Referral USDT as the source balance; the DOGE coin always debits Available DOGE
            directly, no picker. Every withdrawal is still completed by an admin manually
            broadcasting the real transaction on the Withdrawals tab, adding a chain here never
            automates sending.
          </p>
        </div>
        <button onClick={() => setShowAdd((v) => !v)} className="btn-game-outline shrink-0 rounded-full px-4 py-1.5 text-xs">
          {showAdd ? "Cancel" : "+ Add Chain"}
        </button>
      </div>

      {showAdd && <AddWithdrawChainForm onDone={() => setShowAdd(false)} />}

      <div className="mt-4 flex flex-col gap-3">
        {isLoading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : !data?.rows.length ? (
          <p className="text-sm text-muted">No withdrawal chains configured.</p>
        ) : (
          data.rows.map((row) => <WithdrawChainRow key={row.id} row={row} />)
        )}
      </div>
    </section>
  );
}

function AddWithdrawChainForm({ onDone }: { onDone: () => void }) {
  const add = useAddWithdrawChain();
  const [chainKey, setChainKey] = useState("");
  const [label, setLabel] = useState("");
  const [coinSymbol, setCoinSymbol] = useState<"USDT" | "DOGE">("USDT");
  const [addressRegex, setAddressRegex] = useState("");
  const [explorerTxUrl, setExplorerTxUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      await add.mutateAsync({
        chainKey: chainKey.trim().toUpperCase(),
        label: label.trim(),
        coinSymbol,
        addressRegex: addressRegex.trim(),
        explorerTxUrl: explorerTxUrl.trim() || null,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add chain");
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-line bg-panel-2 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Chain key" hint="Uppercase, e.g. POLYGON">
          <input value={chainKey} onChange={(e) => setChainKey(e.target.value)} placeholder="POLYGON" className={inputClass} />
        </Field>
        <Field label="Display label">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Polygon" className={inputClass} />
        </Field>
        <Field label="Coin">
          <select value={coinSymbol} onChange={(e) => setCoinSymbol(e.target.value as "USDT" | "DOGE")} className={inputClass}>
            <option value="USDT">USDT</option>
            <option value="DOGE">DOGE</option>
          </select>
        </Field>
        <Field label="Address format (regex)" hint="e.g. ^0x[a-fA-F0-9]{40}$">
          <input value={addressRegex} onChange={(e) => setAddressRegex(e.target.value)} placeholder="^0x[a-fA-F0-9]{40}$" className={inputClass} />
        </Field>
        <Field label="Explorer tx URL" hint="txHash appended directly; blank uses a built-in default if recognized">
          <input value={explorerTxUrl} onChange={(e) => setExplorerTxUrl(e.target.value)} placeholder="https://…/tx/" className={inputClass} />
        </Field>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={add.isPending || !chainKey.trim() || !label.trim() || !addressRegex.trim()}
          className="btn-game-outline rounded-full px-4 py-1.5 text-xs disabled:opacity-50"
        >
          {add.isPending ? "Adding…" : "Add Chain"}
        </button>
        {error && <span className="text-xs text-risk">{error}</span>}
      </div>
    </div>
  );
}

function WithdrawChainRow({ row }: { row: AdminWithdrawChainRow }) {
  const update = useUpdateWithdrawChain();
  const del = useDeleteWithdrawChain();
  const [editing, setEditing] = useState(false);
  const [addressRegex, setAddressRegex] = useState(row.addressRegex);
  const [explorerTxUrl, setExplorerTxUrl] = useState(row.explorerTxUrl ?? "");
  const [error, setError] = useState<string | null>(null);

  async function toggleEnabled() {
    setError(null);
    try {
      await update.mutateAsync({ id: row.id, enabled: !row.enabled });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function saveEdit() {
    setError(null);
    try {
      await update.mutateAsync({ id: row.id, addressRegex: addressRegex.trim(), explorerTxUrl: explorerTxUrl.trim() || null });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  async function doDelete() {
    if (!confirm(`Remove ${row.label} as a withdrawal option?`)) return;
    setError(null);
    try {
      await del.mutateAsync(row.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <div className="rounded-xl border border-line bg-panel-2 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold">
            {chainIcon(row.chainKey)} {row.label}
            <span className="rounded-full border border-line px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted">{row.chainKey}</span>
            <span className="flex items-center gap-1 rounded-full border border-gold/30 bg-gold-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-gold">
              {coinIcon(row.coinSymbol, 12)} {row.coinSymbol}
            </span>
            {!row.enabled && <span className="rounded-full border border-risk/40 bg-risk-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-risk">Disabled</span>}
          </p>
          <p className="mt-1 break-all font-mono text-xs text-muted">{row.addressRegex}</p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button onClick={() => setEditing((v) => !v)} className="rounded-full border border-line px-3 py-1 text-[11px] text-muted hover:text-foreground">
            {editing ? "Cancel" : "Edit"}
          </button>
          <button
            onClick={toggleEnabled}
            disabled={update.isPending}
            className="rounded-full border border-line px-3 py-1 text-[11px] text-muted hover:text-foreground disabled:opacity-50"
          >
            {row.enabled ? "Disable" : "Enable"}
          </button>
          <button
            onClick={doDelete}
            disabled={del.isPending}
            className="rounded-full border border-risk/40 px-3 py-1 text-[11px] font-semibold text-risk hover:bg-risk-soft disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-2">
          <input value={addressRegex} onChange={(e) => setAddressRegex(e.target.value)} className={inputClass} placeholder="Address regex" />
          <input value={explorerTxUrl} onChange={(e) => setExplorerTxUrl(e.target.value)} className={inputClass} placeholder="Explorer tx URL" />
          <button onClick={saveEdit} disabled={update.isPending} className="btn-game-outline rounded-full px-4 py-1.5 text-xs disabled:opacity-50 sm:col-span-2 sm:w-fit">
            {update.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-risk">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------
// Withdrawal Policy — the two coin-level minimums, moved out of the
// old "Treasury" section since they're not treasury/deposit config
// ---------------------------------------------------------------------

function WithdrawalPolicySection() {
  const { data, isLoading } = useAdminSettings();
  const update = useUpdateAdminSettings();

  const [minUsdtWithdrawal, setMinUsdtWithdrawal] = useState("");
  const [minDogeWithdrawal, setMinDogeWithdrawal] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialized = useRef(false);
  useEffect(() => {
    if (!data || initialized.current) return;
    initialized.current = true;
    setMinUsdtWithdrawal(data.minUsdtWithdrawal !== null ? String(data.minUsdtWithdrawal) : "");
    setMinDogeWithdrawal(data.minDogeWithdrawal !== null ? String(data.minDogeWithdrawal) : "");
  }, [data]);

  async function save() {
    setError(null);
    setSaved(false);
    try {
      await update.mutateAsync({
        minUsdtWithdrawal: minUsdtWithdrawal.trim() ? Number(minUsdtWithdrawal) : null,
        minDogeWithdrawal: minDogeWithdrawal.trim() ? Number(minDogeWithdrawal) : null,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  if (isLoading || !data) {
    return (
      <section className="game-panel hud-corner rounded-2xl p-5">
        <p className="text-sm text-muted">Loading…</p>
      </section>
    );
  }

  return (
    <section className="game-panel hud-corner rounded-2xl p-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gold">Withdrawal Policy</p>
      <p className="mt-1 text-xs text-muted">
        One minimum per coin, shared across every chain that sends it (e.g. both BEP20 and TRC20
        USDT withdrawals use the same minimum).
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Minimum USDT withdrawal" hint={`Falls back to $${data.defaults.minUsdtWithdrawal} if left blank`}>
          <input type="number" step="0.01" value={minUsdtWithdrawal} onChange={(e) => setMinUsdtWithdrawal(e.target.value)} placeholder={String(data.defaults.minUsdtWithdrawal)} className={inputClass} />
        </Field>
        <Field label="Minimum DOGE withdrawal" hint={`Falls back to ${data.defaults.minDogeWithdrawal} DOGE if left blank`}>
          <input type="number" step="0.01" value={minDogeWithdrawal} onChange={(e) => setMinDogeWithdrawal(e.target.value)} placeholder={String(data.defaults.minDogeWithdrawal)} className={inputClass} />
        </Field>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} disabled={update.isPending} className="btn-game-outline rounded-full px-4 py-1.5 text-xs disabled:opacity-50">
          {update.isPending ? "Saving…" : "Save Withdrawal Policy"}
        </button>
        {saved && !update.isPending && <span className="text-xs text-mint">✓ Saved</span>}
        {error && <span className="text-xs text-risk">{error}</span>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------
// Weekly Leaderboard — reward is OFF by default. Rankings always
// compute from real settled matches regardless of this setting; only
// the reward payout is gated. Both "Enabled" AND a pool amount > 0 are
// required before ensureWeekFinalized() (src/lib/leaderboard.ts) will
// actually credit any GAME_REWARD_USDT — leaving either unset just
// shows rankings with $0 reward.
// ---------------------------------------------------------------------

function WeeklyLeaderboardSection() {
  const { data, isLoading } = useAdminSettings();
  const update = useUpdateAdminSettings();

  const [enabled, setEnabled] = useState(false);
  const [poolUsdt, setPoolUsdt] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialized = useRef(false);
  useEffect(() => {
    if (!data || initialized.current) return;
    initialized.current = true;
    setEnabled(data.weeklyLeaderboardEnabled);
    setPoolUsdt(data.weeklyLeaderboardPoolUsdt !== null ? String(data.weeklyLeaderboardPoolUsdt) : "");
  }, [data]);

  async function save() {
    setError(null);
    setSaved(false);
    try {
      await update.mutateAsync({
        weeklyLeaderboardEnabled: enabled,
        weeklyLeaderboardPoolUsdt: poolUsdt.trim() ? Number(poolUsdt) : null,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  if (isLoading || !data) {
    return (
      <section className="game-panel hud-corner rounded-2xl p-5">
        <p className="text-sm text-muted">Loading…</p>
      </section>
    );
  }

  const willPayOut = enabled && poolUsdt.trim() !== "" && Number(poolUsdt) > 0;

  return (
    <section className="game-panel hud-corner rounded-2xl p-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gold">Weekly Leaderboard</p>
      <p className="mt-1 text-xs text-muted">
        Reward payout is off by default, the leaderboard page always shows real rankings from
        real settled matches, but no Game Reward USDT is credited until both fields below are set.
        Top 3 split is fixed at 55% / 30% / 15%. Turning this on only affects weeks that haven&rsquo;t
        ended yet, a week already finalized unpaid stays unpaid.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-mint" />
          <span>Enable weekly reward payout</span>
        </label>
        <Field label="Weekly pool (USDT)" hint="Required, above $0, for the reward to actually pay out">
          <input type="number" min="0" step="0.01" value={poolUsdt} onChange={(e) => setPoolUsdt(e.target.value)} placeholder="e.g. 25" className={inputClass} />
        </Field>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} disabled={update.isPending} className="btn-game-outline rounded-full px-4 py-1.5 text-xs disabled:opacity-50">
          {update.isPending ? "Saving…" : "Save Weekly Leaderboard"}
        </button>
        {saved && !update.isPending && (
          <span className="text-xs text-mint">
            ✓ Saved: {willPayOut ? "reward payout is live for the current week" : "rankings only, no reward"}
          </span>
        )}
        {error && <span className="text-xs text-risk">{error}</span>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------
// WalletConnect — lets mobile browsers (Safari/Chrome, no injected
// wallet) deep-link into MetaMask/Trust Wallet/etc. Without a real
// Project ID here, those users hit a "mobile wallet connect isn't
// configured yet" dead end on Connect Wallet — see src/lib/wagmi.ts and
// src/components/ConnectWalletButton.tsx.
// ---------------------------------------------------------------------

function WalletConnectSection() {
  const { data, isLoading } = useAdminSettings();
  const update = useUpdateAdminSettings();

  const [projectId, setProjectId] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialized = useRef(false);
  useEffect(() => {
    if (!data || initialized.current) return;
    initialized.current = true;
    setProjectId(data.walletConnectProjectId ?? "");
  }, [data]);

  async function save() {
    setError(null);
    setSaved(false);
    try {
      await update.mutateAsync({ walletConnectProjectId: projectId.trim() || null });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  if (isLoading || !data) {
    return (
      <section className="game-panel hud-corner rounded-2xl p-5">
        <p className="text-sm text-muted">Loading…</p>
      </section>
    );
  }

  return (
    <section className="game-panel hud-corner rounded-2xl p-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gold">WalletConnect</p>
      <p className="mt-1 text-xs text-muted">
        Lets a mobile browser with no wallet extension (regular Safari/Chrome tab) deep-link into
        MetaMask, Trust Wallet, or any other WalletConnect-compatible app to connect. Get a free
        Project ID at{" "}
        <a href="https://cloud.reown.com" target="_blank" rel="noreferrer" className="text-mint underline">
          cloud.reown.com
        </a>
        . Leave blank to fall back to the server&apos;s NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID env
        var (or disable mobile connect entirely if that&apos;s unset too).
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="WalletConnect Project ID">
          <input value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="e.g. 3f9e2b1a…" className={inputClass} />
        </Field>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} disabled={update.isPending} className="btn-game-outline rounded-full px-4 py-1.5 text-xs disabled:opacity-50">
          {update.isPending ? "Saving…" : "Save WalletConnect"}
        </button>
        {saved && !update.isPending && <span className="text-xs text-mint">✓ Saved: takes effect on next page load</span>}
        {error && <span className="text-xs text-risk">{error}</span>}
      </div>
    </section>
  );
}

function AdminUsersSection() {
  const { data, isLoading } = useAdminUserList();
  const add = useAddAdminUser();
  const remove = useRemoveAdminUser();
  const [newAddress, setNewAddress] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function doAdd() {
    setError(null);
    try {
      await add.mutateAsync(newAddress.trim());
      setNewAddress("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    }
  }

  async function doRemove(id: string) {
    setError(null);
    try {
      await remove.mutateAsync(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
    }
  }

  return (
    <section className="game-panel hud-corner rounded-2xl p-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gold">Admin Users</p>
      <p className="mt-1 text-xs text-muted">
        Wallet addresses with access to this /admin area. Entries from ADMIN_ADDRESSES (env) are
        read-only here, edit .env directly to change those. Everyone else can be added or
        removed below, no redeploy needed.
      </p>

      <div className="mt-4 flex gap-2">
        <input
          value={newAddress}
          onChange={(e) => setNewAddress(e.target.value)}
          placeholder="0x… wallet address to grant admin access"
          className={`flex-1 ${inputClass}`}
        />
        <button
          onClick={doAdd}
          disabled={add.isPending || !newAddress.trim()}
          className="btn-game-outline rounded-full px-4 py-1.5 text-xs disabled:opacity-50"
        >
          {add.isPending ? "Adding…" : "Add Admin"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-risk">{error}</p>}

      <div className="mt-4 divide-y divide-line rounded-xl border border-line">
        {isLoading ? (
          <p className="p-3 text-sm text-muted">Loading…</p>
        ) : !data?.rows.length ? (
          <p className="p-3 text-sm text-muted">No admins configured.</p>
        ) : (
          data.rows.map((row) => (
            <div key={row.id ?? row.address} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div>
                <p className="break-all font-mono text-xs">
                  {row.address}
                  {row.address === data.you && <span className="ml-2 rounded-full bg-gold-soft px-2 py-0.5 text-[10px] font-bold text-gold">YOU</span>}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {row.source === "env" ? "From ADMIN_ADDRESSES (env), read-only" : `Added${row.createdAt ? ` ${new Date(row.createdAt).toLocaleDateString()}` : ""}`}
                </p>
              </div>
              {row.source === "db" && row.id && row.address !== data.you && (
                <button
                  onClick={() => doRemove(row.id!)}
                  disabled={remove.isPending}
                  className="shrink-0 rounded-full border border-risk/40 px-3 py-1 text-[11px] font-semibold text-risk transition hover:bg-risk-soft disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function SocialSection() {
  const { data, isLoading } = useAdminSettings();
  const update = useUpdateAdminSettings();

  const [twitterUrl, setTwitterUrl] = useState("");
  const [telegramUrl, setTelegramUrl] = useState("");
  const [discordUrl, setDiscordUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [redditUrl, setRedditUrl] = useState("");
  const [tiktokUrl, setTiktokUrl] = useState("");
  const [mediumUrl, setMediumUrl] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync once on first load, not on every refetch — see the matching
  // comment in WithdrawalPolicySection for why (saving that section
  // would otherwise wipe unsaved edits here).
  const initialized = useRef(false);
  useEffect(() => {
    if (!data || initialized.current) return;
    initialized.current = true;
    setTwitterUrl(data.twitterUrl ?? "");
    setTelegramUrl(data.telegramUrl ?? "");
    setDiscordUrl(data.discordUrl ?? "");
    setYoutubeUrl(data.youtubeUrl ?? "");
    setInstagramUrl(data.instagramUrl ?? "");
    setFacebookUrl(data.facebookUrl ?? "");
    setLinkedinUrl(data.linkedinUrl ?? "");
    setRedditUrl(data.redditUrl ?? "");
    setTiktokUrl(data.tiktokUrl ?? "");
    setMediumUrl(data.mediumUrl ?? "");
  }, [data]);

  async function save() {
    setError(null);
    setSaved(false);
    try {
      await update.mutateAsync({
        twitterUrl: twitterUrl.trim() || null,
        telegramUrl: telegramUrl.trim() || null,
        discordUrl: discordUrl.trim() || null,
        youtubeUrl: youtubeUrl.trim() || null,
        instagramUrl: instagramUrl.trim() || null,
        facebookUrl: facebookUrl.trim() || null,
        linkedinUrl: linkedinUrl.trim() || null,
        redditUrl: redditUrl.trim() || null,
        tiktokUrl: tiktokUrl.trim() || null,
        mediumUrl: mediumUrl.trim() || null,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  if (isLoading || !data) {
    return (
      <section className="game-panel hud-corner rounded-2xl p-5">
        <p className="text-sm text-muted">Loading…</p>
      </section>
    );
  }

  return (
    <section className="game-panel hud-corner rounded-2xl p-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gold">Social Media</p>
      <p className="mt-1 text-xs text-muted">
        Shown as icons in the footer of the landing page and dashboard. Leave blank to hide that
        icon entirely.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="X (Twitter) URL">
          <input value={twitterUrl} onChange={(e) => setTwitterUrl(e.target.value)} placeholder="https://x.com/…" className={inputClass} />
        </Field>
        <Field label="Telegram URL">
          <input value={telegramUrl} onChange={(e) => setTelegramUrl(e.target.value)} placeholder="https://t.me/…" className={inputClass} />
        </Field>
        <Field label="Discord URL">
          <input value={discordUrl} onChange={(e) => setDiscordUrl(e.target.value)} placeholder="https://discord.gg/…" className={inputClass} />
        </Field>
        <Field label="YouTube URL">
          <input value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://youtube.com/@…" className={inputClass} />
        </Field>
        <Field label="Instagram URL">
          <input value={instagramUrl} onChange={(e) => setInstagramUrl(e.target.value)} placeholder="https://instagram.com/…" className={inputClass} />
        </Field>
        <Field label="Facebook URL">
          <input value={facebookUrl} onChange={(e) => setFacebookUrl(e.target.value)} placeholder="https://facebook.com/…" className={inputClass} />
        </Field>
        <Field label="LinkedIn URL">
          <input value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/company/…" className={inputClass} />
        </Field>
        <Field label="Reddit URL">
          <input value={redditUrl} onChange={(e) => setRedditUrl(e.target.value)} placeholder="https://reddit.com/r/…" className={inputClass} />
        </Field>
        <Field label="TikTok URL">
          <input value={tiktokUrl} onChange={(e) => setTiktokUrl(e.target.value)} placeholder="https://tiktok.com/@…" className={inputClass} />
        </Field>
        <Field label="Medium URL">
          <input value={mediumUrl} onChange={(e) => setMediumUrl(e.target.value)} placeholder="https://medium.com/@…" className={inputClass} />
        </Field>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} disabled={update.isPending} className="btn-game-outline rounded-full px-4 py-1.5 text-xs disabled:opacity-50">
          {update.isPending ? "Saving…" : "Save Social Links"}
        </button>
        {saved && !update.isPending && <span className="text-xs text-mint">✓ Saved</span>}
        {error && <span className="text-xs text-risk">{error}</span>}
      </div>
    </section>
  );
}
