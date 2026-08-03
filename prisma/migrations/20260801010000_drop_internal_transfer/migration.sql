-- Reverts the wallet-to-wallet InternalTransfer model added moments
-- earlier this session — corrected requirement: this feature moves a
-- balance between a user's OWN Play/Recycled/Referral USDT, never to
-- another wallet, so there's no counterparty to track and no dedicated
-- table needed (same convention as every other same-wallet conversion
-- in this app — see doge_to_usdt_conversion/pts_to_gamereward_conversion,
-- which are just two LedgerEntry rows, no separate model). Only ever
-- contained today's smoke-test rows, no real user data.
DROP TABLE "InternalTransfer";
