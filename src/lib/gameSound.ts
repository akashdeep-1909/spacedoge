"use client";

// Lightweight synthesized sound effects for Coin Rush Arena
// (src/components/game/CoinRushArena.tsx) — same no-asset-files, Web
// Audio oscillator convention src/lib/rewardSound.ts already uses for
// the reward-reveal screen (see that file's own doc-comment: browsers
// block audio until a real user gesture, and every one of these only
// ever fires well after the player has already interacted with the
// page to start a match, so there's no autoplay-block concern here).
// Kept as its own module rather than folded into rewardSound.ts since
// this one also needs a genuinely PERSISTENT node (the engine hum
// below), not just one-shot blips.
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
  gain.gain.linearRampToValueAtTime(gainPeak, audio.currentTime + startOffset + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + startOffset + duration);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(audio.currentTime + startOffset);
  osc.stop(audio.currentTime + startOffset + duration + 0.02);
}

// --- One-shot power-up cues ---------------------------------------------
// One per activation (not per-tick/per-bullet) — a 5s/10s power-up
// firing its "in use" sound continuously would just be noise; this is
// the "systems online" cue the moment the player presses the button.

export function playMagnetSound() {
  tone(320, 0, 0.1, "sine", 0.05);
  tone(520, 0.05, 0.12, "sine", 0.05);
  tone(760, 0.1, 0.16, "sine", 0.05);
}

export function playShieldSound() {
  tone(440, 0, 0.22, "sine", 0.05);
  tone(660, 0.02, 0.24, "sine", 0.04);
  tone(880, 0.04, 0.26, "triangle", 0.035);
}

export function playBoostSound() {
  tone(140, 0, 0.05, "sawtooth", 0.06);
  tone(320, 0.03, 0.09, "sawtooth", 0.07);
  tone(680, 0.06, 0.14, "sawtooth", 0.05);
}

export function playFireSound() {
  const audio = getCtx();
  if (!audio) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(900, audio.currentTime);
  osc.frequency.exponentialRampToValueAtTime(180, audio.currentTime + 0.14);
  gain.gain.setValueAtTime(0.05, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.16);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + 0.18);
}

// A quiet, short "zap" for each bullet that actually connects with a
// hazard — deliberately tiny (short duration, low gain) since a single
// Fire activation can land several of these in quick succession.
export function playZapSound() {
  tone(1100, 0, 0.05, "square", 0.02);
  tone(500, 0.02, 0.06, "sawtooth", 0.02);
}

// --- Damage feedback ------------------------------------------------------

// A real hit landing — low gritty thud (a short burst of filtered noise
// plus a low tone), distinct from the shield-block "clang" below so a
// player can tell by ear whether that hit actually cost them a life.
export function playHitSound() {
  const audio = getCtx();
  if (!audio) return;
  const bufferSize = Math.max(1, Math.floor(audio.sampleRate * 0.12));
  const buffer = audio.createBuffer(1, bufferSize, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const noise = audio.createBufferSource();
  noise.buffer = buffer;
  const noiseGain = audio.createGain();
  noiseGain.gain.setValueAtTime(0.12, audio.currentTime);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.12);
  noise.connect(noiseGain);
  noiseGain.connect(audio.destination);
  noise.start();
  tone(110, 0, 0.16, "sawtooth", 0.09);
}

// A hit that Shield fully absorbed — a bright metallic "clang," never
// confused with the thud above.
export function playShieldBlockSound() {
  tone(1400, 0, 0.05, "square", 0.04);
  tone(900, 0.02, 0.09, "triangle", 0.04);
}

// --- Continuous rocket engine hum ----------------------------------------
//
// A PERSISTENT oscillator, not a one-shot tone() — its pitch and volume
// are ramped every frame (see updateEngineSound) as the human ship's own
// speed changes, so it reads as "the rocket accelerating," not a static
// drone. Lazily created on first call (same gesture-gated getCtx() as
// every other sound here); explicitly torn down by stopEngineSound(),
// which the arena calls both when a run actually ends (finish()) and
// when the component unmounts — left unstopped, the oscillator would
// otherwise keep humming in the background after the player has already
// left the page.
let engineOsc: OscillatorNode | null = null;
let engineGain: GainNode | null = null;
let engineFilter: BiquadFilterNode | null = null;

export function updateEngineSound(speedFrac: number) {
  const audio = getCtx();
  if (!audio) return;
  const clamped = Math.max(0, Math.min(1, speedFrac));
  if (!engineOsc || !engineGain || !engineFilter) {
    engineOsc = audio.createOscillator();
    engineGain = audio.createGain();
    engineFilter = audio.createBiquadFilter();
    engineFilter.type = "lowpass";
    engineFilter.frequency.value = 300;
    engineOsc.type = "sawtooth";
    engineOsc.frequency.value = 55;
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(audio.destination);
    engineOsc.start();
  }
  // Local non-null aliases — the module-level `let`s above are
  // reassigned by stopEngineSound() from a different call, so TS can't
  // narrow them as non-null across statements the way a plain local
  // variable would be; the lazy-init block just above guarantees all
  // three are set by this point in the same call.
  const osc = engineOsc;
  const gain = engineGain;
  const filter = engineFilter;
  const now = audio.currentTime;
  // A faint idle hum even at a standstill (barely audible) so the
  // engine reads as "always running," rising clearly once the ship
  // actually starts moving and climbing further under Boost.
  const targetFreq = 55 + clamped * 130;
  const targetGain = clamped > 0.02 ? 0.015 + clamped * 0.05 : 0.006;
  const targetFilterFreq = 300 + clamped * 900;
  // setTargetAtTime (exponential approach), not setValueAtTime — a hard
  // jump every frame is exactly what produces the clicking/zipper noise
  // this smooths away.
  osc.frequency.setTargetAtTime(targetFreq, now, 0.08);
  gain.gain.setTargetAtTime(targetGain, now, 0.12);
  filter.frequency.setTargetAtTime(targetFilterFreq, now, 0.1);
}

export function stopEngineSound() {
  const audio = getCtx();
  const osc = engineOsc;
  const gain = engineGain;
  const filter = engineFilter;
  engineOsc = null;
  engineGain = null;
  engineFilter = null;
  if (!osc || !gain) return;
  if (audio) gain.gain.setTargetAtTime(0, audio.currentTime, 0.04);
  // Actual node teardown on a short delay so the fade-out above isn't
  // cut off abruptly (an immediate .stop() would click).
  setTimeout(() => {
    try {
      osc.stop();
    } catch {
      // already stopped — nothing to do
    }
    osc.disconnect();
    gain.disconnect();
    filter?.disconnect();
  }, 150);
}
