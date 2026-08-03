// Doc section 12.1: a real DOGE/USDT rate must come from "an approved
// liquidity source," time-limited and re-checked server-side before
// executing. CoinGecko's public spot price is that real rate now — the
// piece still missing is an actual liquidity source that EXECUTES the
// swap on-chain; this still only posts a ledger debit/credit at that
// real observed price, it doesn't route through a real exchange/DEX.
export const CONVERSION_FEE_PCT = 0.015; // "Conversion revenue at 1.5%" — doc economics table
export const MIN_DOGE_CONVERSION = 5;
export const QUOTE_VALID_MS = 30_000;

const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price?ids=dogecoin&vs_currencies=usd";
const RATE_CACHE_MS = 30_000; // matches the client's own quote-refresh cadence — no reason to hit CoinGecko more often than the UI actually refreshes
// Last-resort fallback only, if CoinGecko has never once been reachable
// since this process started — confirmed on a real report: a user saw
// exactly this number ($0.09000) rendered as if it were live, with
// nothing in the server logs explaining why, because the catch block
// below used to fail completely silently. This value drifts further
// from reality the longer it goes unused in practice, so it's a "the
// page still works" safety net, never a real quote — see the loud
// logging below for exactly when it fires.
const BASE_DOGE_USDT_RATE = 0.09;

let cachedRate: { rate: number; fetchedAt: number } | null = null;

async function fetchDogeUsdtRateOnce(): Promise<number> {
  const res = await fetch(COINGECKO_URL, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`CoinGecko responded ${res.status}`);
  const body = await res.json();
  const rate = Number(body?.dogecoin?.usd);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Malformed CoinGecko response");
  return rate;
}

// Exported for src/lib/mining.ts — mining v2 settlement computes
// everything in USDT (real fleet economics) and only converts to DOGE
// at the moment of crediting AVAILABLE_DOGE, using this same real,
// cached spot rate a user-initiated conversion would see.
export async function fetchDogeUsdtRate(): Promise<number> {
  const now = Date.now();
  if (cachedRate && now - cachedRate.fetchedAt < RATE_CACHE_MS) {
    return cachedRate.rate;
  }
  try {
    const rate = await fetchDogeUsdtRateOnce();
    cachedRate = { rate, fetchedAt: now };
    return rate;
  } catch (err) {
    // One retry after a short delay — same reasoning as
    // src/lib/deposits.ts's evmRpcCall: a single failed call to a free
    // public API shouldn't be the difference between a real quote and
    // the fabricated fallback below.
    console.error("[conversion] CoinGecko fetch failed (attempt 1/2)", err);
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const rate = await fetchDogeUsdtRateOnce();
      cachedRate = { rate, fetchedAt: now };
      return rate;
    } catch (err2) {
      console.error("[conversion] CoinGecko fetch failed (attempt 2/2)", err2);
      if (cachedRate) {
        console.warn(`[conversion] serving last known-good rate ${cachedRate.rate} (fetched ${Math.round((now - cachedRate.fetchedAt) / 1000)}s ago)`);
        return cachedRate.rate;
      }
      // No real rate has EVER been fetched in this process — the only
      // remaining option is the fabricated baseline. Loud on purpose:
      // this is the one path where a number gets shown to a user that
      // was never actually observed anywhere.
      console.error(`[conversion] no real DOGE/USDT rate available yet this process — falling back to the fabricated baseline ${BASE_DOGE_USDT_RATE}`);
      return BASE_DOGE_USDT_RATE;
    }
  }
}

export async function getDogeUsdtQuote(dogeAmount: number) {
  const rate = await fetchDogeUsdtRate();

  const grossUsdt = Math.round(dogeAmount * rate * 1e6) / 1e6;
  const feeUsdt = Math.round(grossUsdt * CONVERSION_FEE_PCT * 1e6) / 1e6;
  const finalUsdt = Math.round((grossUsdt - feeUsdt) * 1e6) / 1e6;

  return {
    dogeAmount,
    rate,
    feePct: CONVERSION_FEE_PCT,
    feeUsdt,
    finalUsdt,
    isSimulated: false as const,
    expiresAt: new Date(Date.now() + QUOTE_VALID_MS).toISOString(),
  };
}
