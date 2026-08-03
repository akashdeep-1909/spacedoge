// Real, external, verifiable Dogecoin network stats — deliberately
// distinct from this platform's own hashrate/reward numbers, which
// come from a formula-driven virtual allocation system, not real work
// submitted to this network. Shown purely as honest real-world
// context (same "reference, not something this platform produces or
// controls" framing as fetchDogeUsdtRate in conversion.ts), never
// implied to be caused by or connected to this platform's own fleet.
// Blockchair's public stats endpoint needs no API key/auth for this.
const BLOCKCHAIR_STATS_URL = "https://api.blockchair.com/dogecoin/stats";
const STATS_CACHE_MS = 5 * 60_000; // real difficulty/hashrate only change every so often — no reason to hit this every request

export interface DogeNetworkStats {
  difficulty: number;
  networkHashrateThs: number;
  fetchedAt: string;
}

let cachedStats: { stats: DogeNetworkStats; fetchedAt: number } | null = null;

export async function fetchDogeNetworkStats(): Promise<DogeNetworkStats | null> {
  const now = Date.now();
  if (cachedStats && now - cachedStats.fetchedAt < STATS_CACHE_MS) {
    return cachedStats.stats;
  }
  try {
    const res = await fetch(BLOCKCHAIR_STATS_URL, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`Blockchair responded ${res.status}`);
    const body = await res.json();
    const difficulty = Number(body?.data?.difficulty);
    // hashrate_24h arrives as a string of raw H/s (e.g. "1670166070785495")
    const hashrateHs = Number(body?.data?.hashrate_24h);
    if (!Number.isFinite(difficulty) || difficulty <= 0 || !Number.isFinite(hashrateHs) || hashrateHs <= 0) {
      throw new Error("Malformed Blockchair response");
    }
    const stats: DogeNetworkStats = {
      difficulty,
      networkHashrateThs: hashrateHs / 1e12,
      fetchedAt: new Date(now).toISOString(),
    };
    cachedStats = { stats, fetchedAt: now };
    return stats;
  } catch {
    // Blockchair unreachable/rate-limited — serve the last known-good
    // reading (still real, just possibly a few minutes stale) rather
    // than fabricate one; only give up entirely (null) if we've never
    // once fetched successfully, so the UI can just omit the section
    // rather than show anything invented.
    return cachedStats?.stats ?? null;
  }
}
