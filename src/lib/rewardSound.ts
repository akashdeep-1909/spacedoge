"use client";

// Tiny synthesized sound effects for the match-result reward reveal
// (src/components/game/MatchResultReveal.tsx) — no audio asset files,
// just short oscillator blips via the Web Audio API. Lazily creates one
// shared AudioContext on first use (browsers block audio until a user
// gesture, and this only ever runs after the player has already
// interacted with the page to get here).
let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq: number, startOffset: number, duration: number, type: OscillatorType, gainPeak: number) {
  const audio = getCtx();
  if (!audio) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audio.currentTime + startOffset);
  gain.gain.setValueAtTime(0, audio.currentTime + startOffset);
  gain.gain.linearRampToValueAtTime(gainPeak, audio.currentTime + startOffset + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + startOffset + duration);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(audio.currentTime + startOffset);
  osc.stop(audio.currentTime + startOffset + duration + 0.02);
}

// A rising two-note "whoosh + chime" for the box bursting open.
export function playBoxOpenSound() {
  tone(220, 0, 0.12, "sawtooth", 0.05);
  tone(660, 0.08, 0.22, "triangle", 0.07);
  tone(990, 0.14, 0.28, "sine", 0.06);
}

// A quick bright "coin" blip for PTS landing in the balance, repeated
// faster as the count-up accelerates toward its final value.
export function playCoinSound() {
  tone(1200, 0, 0.08, "sine", 0.05);
  tone(1600, 0.03, 0.09, "sine", 0.04);
}
