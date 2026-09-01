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
// PERSISTENT nodes, not one-shot tone()s — pitch/volume/tone are ramped
// every frame (see updateEngineSound) as the human ship's own speed
// changes, so it reads as "the rocket accelerating," not a static drone.
// A single oscillator through a lowpass filter (the first version of
// this) read thin and buzzy — confirmed live ("the rocket run sound is
// not really good"). Rebuilt as two layers blended under one master
// gain, the same basic recipe real engine/rocket SFX are built from:
//   1. A filtered noise "rumble" (brown noise — a leaky integrator over
//      white noise, smoother/deeper than raw hiss — through a bandpass
//      filter whose center frequency rises with speed) for the actual
//      thrust roar.
//   2. Two detuned sawtooth oscillators through their own lowpass filter
//      for a thicker tonal "growl" underneath the rumble — the slight
//      detuning is what keeps it from sounding like a single flat
//      oscillator beeping, the same reason a real synth patch layers
//      multiple slightly-mistuned oscillators for width.
// Lazily created on first call (same gesture-gated getCtx() as every
// other sound here); explicitly torn down by stopEngineSound(), which
// the arena calls both when a run actually ends (finish()) and when the
// component unmounts — left unstopped, this would otherwise keep
// rumbling in the background after the player has already left the page.
let engineMasterGain: GainNode | null = null;
let engineNoiseSource: AudioBufferSourceNode | null = null;
let engineNoiseFilter: BiquadFilterNode | null = null;
let engineNoiseGain: GainNode | null = null;
let engineToneOsc1: OscillatorNode | null = null;
let engineToneOsc2: OscillatorNode | null = null;
let engineToneFilter: BiquadFilterNode | null = null;
let engineToneGain: GainNode | null = null;

// A few seconds of looping brown-ish noise (a leaky integrator over
// white noise) — deeper and smoother than raw white noise, which reads
// as harsh static rather than a rumble once run through a bandpass
// filter.
function createEngineNoiseBuffer(audio: AudioContext): AudioBuffer {
  const seconds = 2;
  const bufferSize = Math.max(1, Math.floor(audio.sampleRate * seconds));
  const buffer = audio.createBuffer(1, bufferSize, audio.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.2; // compensates for the integrator's own gain loss
  }
  return buffer;
}

export function updateEngineSound(speedFrac: number) {
  const audio = getCtx();
  if (!audio) return;
  const clamped = Math.max(0, Math.min(1, speedFrac));

  if (!engineMasterGain || !engineNoiseSource || !engineToneOsc1 || !engineToneOsc2) {
    engineMasterGain = audio.createGain();
    engineMasterGain.gain.value = 0;
    engineMasterGain.connect(audio.destination);

    engineNoiseSource = audio.createBufferSource();
    engineNoiseSource.buffer = createEngineNoiseBuffer(audio);
    engineNoiseSource.loop = true;
    engineNoiseFilter = audio.createBiquadFilter();
    engineNoiseFilter.type = "bandpass";
    engineNoiseFilter.frequency.value = 90;
    engineNoiseFilter.Q.value = 0.7;
    engineNoiseGain = audio.createGain();
    engineNoiseGain.gain.value = 0;
    engineNoiseSource.connect(engineNoiseFilter);
    engineNoiseFilter.connect(engineNoiseGain);
    engineNoiseGain.connect(engineMasterGain);
    engineNoiseSource.start();

    engineToneOsc1 = audio.createOscillator();
    engineToneOsc1.type = "sawtooth";
    engineToneOsc1.frequency.value = 48;
    engineToneOsc2 = audio.createOscillator();
    engineToneOsc2.type = "sawtooth";
    engineToneOsc2.frequency.value = 48;
    engineToneOsc2.detune.value = 9; // slight beating — width, not a flat single-oscillator beep
    engineToneFilter = audio.createBiquadFilter();
    engineToneFilter.type = "lowpass";
    engineToneFilter.frequency.value = 220;
    engineToneGain = audio.createGain();
    engineToneGain.gain.value = 0;
    engineToneOsc1.connect(engineToneFilter);
    engineToneOsc2.connect(engineToneFilter);
    engineToneFilter.connect(engineToneGain);
    engineToneGain.connect(engineMasterGain);
    engineToneOsc1.start();
    engineToneOsc2.start();
  }

  // Local non-null aliases — the module-level `let`s above are
  // reassigned by stopEngineSound() from a different call, so TS can't
  // narrow them as non-null across statements the way plain locals
  // would be; the lazy-init block just above guarantees all of these
  // are set by this point in the same call.
  const master = engineMasterGain;
  const noiseFilter = engineNoiseFilter!;
  const noiseGain = engineNoiseGain!;
  const toneOsc1 = engineToneOsc1;
  const toneOsc2 = engineToneOsc2;
  const toneFilter = engineToneFilter!;
  const toneGain = engineToneGain!;

  const now = audio.currentTime;
  const idle = clamped <= 0.02;
  // A faint idle presence even at a standstill (barely audible) so the
  // engine reads as "always running," rising clearly once the ship
  // actually starts moving and climbing further under Boost.
  master.gain.setTargetAtTime(idle ? 0.05 : 0.09 + clamped * 0.16, now, 0.15);
  noiseFilter.frequency.setTargetAtTime(90 + clamped * 260, now, 0.12);
  noiseGain.gain.setTargetAtTime(idle ? 0.25 : 0.4 + clamped * 0.35, now, 0.15);
  const toneFreq = 48 + clamped * 95;
  // setTargetAtTime (exponential approach), not setValueAtTime — a hard
  // jump every frame is exactly what produces the clicking/zipper noise
  // this smooths away.
  toneOsc1.frequency.setTargetAtTime(toneFreq, now, 0.08);
  toneOsc2.frequency.setTargetAtTime(toneFreq, now, 0.08);
  toneFilter.frequency.setTargetAtTime(220 + clamped * 700, now, 0.1);
  toneGain.gain.setTargetAtTime(idle ? 0.12 : 0.25 + clamped * 0.3, now, 0.12);
}

export function stopEngineSound() {
  const audio = getCtx();
  const master = engineMasterGain;
  const stoppable = [engineNoiseSource, engineToneOsc1, engineToneOsc2].filter(
    (n): n is AudioBufferSourceNode | OscillatorNode => n !== null
  );
  engineMasterGain = null;
  engineNoiseSource = null;
  engineNoiseFilter = null;
  engineNoiseGain = null;
  engineToneOsc1 = null;
  engineToneOsc2 = null;
  engineToneFilter = null;
  engineToneGain = null;
  if (!master) return;
  if (audio) master.gain.setTargetAtTime(0, audio.currentTime, 0.05);
  // Actual node teardown on a short delay so the fade-out above isn't
  // cut off abruptly (an immediate .stop() would click).
  setTimeout(() => {
    for (const n of stoppable) {
      try {
        n.stop();
      } catch {
        // already stopped — nothing to do
      }
      n.disconnect();
    }
    master.disconnect();
  }, 180);
}
