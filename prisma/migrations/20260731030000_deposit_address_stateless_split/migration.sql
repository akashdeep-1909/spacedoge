-- Replaces persisted per-wallet address assignment with a stateless,
-- deterministic split (hash of wallet id, modulo pool size) computed on
-- every request instead — see getDepositAddressForWallet in
-- src/lib/deposits.ts. No data to preserve here: the assignment table
-- only ever cached what the new function now recomputes on demand.
DROP TABLE "DepositAddressAssignment";
