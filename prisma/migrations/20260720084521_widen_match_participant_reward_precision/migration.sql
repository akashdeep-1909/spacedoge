-- Widen MatchParticipant.rewardUsdt from Decimal(18,6) to Decimal(18,8)
-- to match LedgerEntry's precision (doc 3.5: internal calculations at
-- at least eight decimal places). Non-lossy: only gains precision.
ALTER TABLE "MatchParticipant" ALTER COLUMN "rewardUsdt" SET DATA TYPE DECIMAL(18,8);
