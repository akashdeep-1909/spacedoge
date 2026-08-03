CREATE TABLE "DepositWatcherCursor" (
    "chain" "DepositChain" NOT NULL,
    "lastBlock" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepositWatcherCursor_pkey" PRIMARY KEY ("chain")
);
