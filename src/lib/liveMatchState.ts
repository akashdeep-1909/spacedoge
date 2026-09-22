import type { LiveShipSample } from "./liveMatchStateTypes";
import { GAME_MODE_CONFIG } from "./game-config";
import { RESULTS_GRACE_PERIOD_SECONDS } from "./lobby";

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
// This bucket is also the no-show fallback source at results/route.ts's
// finalize step (a participant who stopped submitting still gets scored
// off their last live sample instead of a flat 0) — so a sample must
// survive not just "the match," but the full window between whenever it
// stopped updating (which can be early: a Rental Bot player has no
// reason to keep a tab foregrounded, so backgrounding can freeze their
// last write right after match start, not near the end) and whenever
// finalize actually runs, which is gated on resultsDeadlineAt =
// startedAt + durationSec + RESULTS_GRACE_PERIOD_SECONDS. Sizing this
// off the longest mode's durationSec (not a flat guess) with real
// margin on top is what keeps that fallback from firing on empty data.
const LONGEST_MODE_DURATION_SEC = Math.max(...Object.values(GAME_MODE_CONFIG).map((c) => c.durationSec));
const STALE_MATCH_MS = (LONGEST_MODE_DURATION_SEC + RESULTS_GRACE_PERIOD_SECONDS + 5 * 60) * 1000;

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
// Per-slot, not whole-bucket: a whole-bucket "evict if the newest
// sample is stale" check means one still-active participant keeps
// every other slot's data alive indefinitely, and conversely one slot
// going idle early (see above) used to be enough to drag the entire
// room's data down with it the moment every other slot also went
// quiet — neither behavior matches what a single slot's own staleness
// should mean. Each slot now ages out purely on its own last write.
function sweepStale() {
  const now = Date.now();
  for (const [matchId, bucket] of store) {
    for (const [slotNumber, sample] of bucket) {
      if (now - sample.updatedAt > STALE_MATCH_MS) bucket.delete(slotNumber);
    }
    if (bucket.size === 0) store.delete(matchId);
  }
}
