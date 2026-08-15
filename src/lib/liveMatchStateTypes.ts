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
  updatedAt: number; // server Date.now() at write time
}
