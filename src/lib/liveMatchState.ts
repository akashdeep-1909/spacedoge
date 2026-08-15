import type { LiveShipSample } from "./liveMatchStateTypes";

// Ephemeral, in-memory live-position store for the Coin Rush spectate
// feature — a real human's ship position/carry/lives while an active
// lobby match is being played, so a player who's already finished their
// own run can watch the others' ships move (see CoinRushArena's
// `spectate` mode) instead of staring at a static "waiting" screen.
//
// Deliberately NOT persisted to Postgres: this app already keeps this
// exact kind of "real but transient, no reason to survive a restart"
// data in a module-level cache (see fetchDogeNetworkStats in
// dogeNetworkStats.ts) rather than writing it to the DB, and the same
// reasoning applies here even more strongly — writing every ~350ms per
// active human straight into Postgres would be pure write amplification
// for data nobody needs a moment after the match ends. next.config.ts
// already runs this app as a single Node process (experimental.cpus:
// 1), so a plain in-process Map needs no cross-process synchronization.
// Losing this on a mid-match server restart only means a spectator's
// view freezes briefly — final scores are untouched, those are still
// written through MatchParticipant/LedgerEntry exactly as before.
const STALE_MATCH_MS = 2 * 60_000; // every match mode finishes well under this; anything older is a dead/abandoned bucket

const store = new Map<string /* matchId */, Map<number /* slotNumber */, LiveShipSample>>();

export function setLiveShipState(matchId: string, slotNumber: number, sample: LiveShipSample): void {
  let bucket = store.get(matchId);
  if (!bucket) {
    bucket = new Map();
    store.set(matchId, bucket);
  }
  bucket.set(slotNumber, sample);
  sweepStale();
}

export function getLiveMatchState(matchId: string): Record<number, LiveShipSample> {
  const bucket = store.get(matchId);
  if (!bucket) return {};
  return Object.fromEntries(bucket);
}

// Sweeps opportunistically on every write rather than running a
// separate timer/cron — same "cheap enough to just check on the way
// through" approach this codebase's other throttle/cache modules use.
function sweepStale() {
  const now = Date.now();
  for (const [matchId, bucket] of store) {
    let newest = 0;
    for (const sample of bucket.values()) newest = Math.max(newest, sample.updatedAt);
    if (now - newest > STALE_MATCH_MS) store.delete(matchId);
  }
}
