// Shared wire/storage shape for CoinRushArena's live-position spectate
// feature (see src/lib/liveMatchState.ts for the server-side ephemeral
// store, and src/app/api/matches/[id]/live-state/route.ts for the
// report/poll endpoints). Split into its own file with no runtime code
// so both the server-only store and the client-side hooks/component can
// import just the type without pulling in the other side's code.
export interface LiveShipSample {
  // Fractions of the playable arena (0..1), not raw canvas pixels — the
  // reporting client and every spectating client can have different
  // canvas width/height/DPR, so position travels as arena-relative
  // fractions and each viewer maps it onto its own canvas.
  xFrac: number;
  yFrac: number;
  carry: number;
  banked: number;
  lives: number;
  alive: boolean;
  // Whether each power-up is CURRENTLY active on the reporting ship —
  // plain booleans, not remaining duration (a spectator only needs "is
  // it on right now," the same read CoinRushArena's own draw code
  // already does via `s.shield > 0` etc. for its own ship). Confirmed
  // live as a real gap: a spectator (or another player's own locally-
  // simulated view of a friend during active play) previously had no
  // way to ever see someone else's Shield/Magnet/Fire glow at all —
  // this game has no shared physics, so a real opponent's own power-up
  // state was invisible to everyone but themselves. boost isn't
  // reported: it only affects movement speed, which is already
  // implicit in the position deltas between samples, and there's no
  // existing per-ship visual treatment for it to hook into (unlike
  // shield/magnet/fire's shared glow-ring — see CoinRushArena's own
  // draw code).
  shield: boolean;
  magnet: boolean;
  fire: boolean;
  updatedAt: number; // server Date.now() at write time
}
