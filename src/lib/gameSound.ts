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
// Went through two earlier passes (a single oscillator+filter, then a
// two-layer noise+detuned-saws version) that both still read as too
// thin/synthetic — confirmed live twice ("not really good," "i want
// really great sound like real games"). Rebuilt as the fuller layer
// stack real engine/thruster SFX are actually built from:
//   1. SUB — a low sine, the felt "power" more than a heard tone.
//   2. RUMBLE — bandpass-filtered brown noise (a leaky integrator over
//      white noise, smoother/deeper than raw hiss), the main body of
//      the roar, filter sweeping upward with speed.
//   3. HISS — highpass-filtered WHITE noise (genuinely high-frequency,
//      unlike the brown noise above) for the airy exhaust turbulence a
//      real thruster has and the previous two passes were missing
//      entirely — this is the layer that makes it sound like moving
//      air, not just an engine drone.
//   4. GROWL — two detuned sawtooths through a lowpass filter AND a
//      soft-clip waveshaper (real distortion, not just a filter) for
//      actual harmonic grit — a clean sawtooth reads as a synth beep no
//      matter how it's filtered; distorting it is what makes it sound
//      like a mechanical engine note instead.
// Two finishing touches tie the layers together instead of four
// separate loops playing at once:
//   - A slow tremolo LFO on the whole mix (~5.5Hz, subtle depth) for
//     the "not perfectly steady" flutter a real combustion engine has
//     — a dead-flat sustained level is what reads as synthetic/looped.
//   - A slow stereo-pan LFO on the hiss layer specifically for a
//     little width/movement instead of a flat mono line.
// Lazily created on first call (same gesture-gated getCtx() as every
// other sound here); explicitly torn down by stopEngineSound(), which
// the arena calls both when a run actually ends (finish()) and when the
// component unmounts — left unstopped, this would otherwise keep
// rumbling in the background after the player has already left the page.
let engineMasterGain: GainNode | null = null;
let engineTremoloGain: GainNode | null = null;
let engineTremoloLfo: OscillatorNode | null = null;
let engineTremoloLfoGain: GainNode | null = null;
let engineSubOsc: OscillatorNode | null = null;
let engineSubGain: GainNode | null = null;
let engineRumbleSource: AudioBufferSourceNode | null = null;
let engineRumbleFilter: BiquadFilterNode | null = null;
let engineRumbleGain: GainNode | null = null;
let engineHissSource: AudioBufferSourceNode | null = null;
let engineHissFilter: BiquadFilterNode | null = null;
let engineHissGain: GainNode | null = null;
let engineHissPanner: StereoPannerNode | null = null;
let enginePanLfo: OscillatorNode | null = null;
let enginePanLfoGain: GainNode | null = null;
let engineGrowlOsc1: OscillatorNode | null = null;
let engineGrowlOsc2: OscillatorNode | null = null;
let engineGrowlFilter: BiquadFilterNode | null = null;
let engineGrowlShaper: WaveShaperNode | null = null;
let engineGrowlGain: GainNode | null = null;

// A few seconds of looping brown-ish noise (a leaky integrator over
// white noise) — deeper and smoother than raw white noise, which reads
// as harsh static rather than a rumble once run through a bandpass
// filter. Used for the RUMBLE layer.
function createBrownNoiseBuffer(audio: AudioContext): AudioBuffer {
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

// Plain looping white noise — deliberately NOT smoothed like the brown
// buffer above, since the HISS layer specifically needs real high-
// frequency content for a highpass filter to have something to pass.
function createWhiteNoiseBuffer(audio: AudioContext): AudioBuffer {
  const seconds = 2;
  const bufferSize = Math.max(1, Math.floor(audio.sampleRate * seconds));
  const buffer = audio.createBuffer(1, bufferSize, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

// Soft-clip saturation curve — real distortion (adds odd harmonics),
// not just a filter sweep, which is what actually turns a clean
// sawtooth into something that reads as a gritty mechanical engine
// note. Standard `(1+k)x / (1+k|x|)` soft-knee shape.
function makeSoftClipCurve(amount: number): Float32Array {
  const n = 8192;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
  }
  return curve;
}

export function updateEngineSound(speedFrac: number) {
  const audio = getCtx();
  if (!audio) return;
  const clamped = Math.max(0, Math.min(1, speedFrac));

  if (!engineMasterGain) {
    engineMasterGain = audio.createGain();
    engineMasterGain.gain.value = 0;

    // Tremolo — a subtle, always-on amplitude wobble across the WHOLE
    // mix, applied once here rather than per-layer, so every layer
    // flutters together instead of drifting out of phase with itself.
    engineTremoloGain = audio.createGain();
    engineTremoloGain.gain.value = 1;
    engineTremoloLfo = audio.createOscillator();
    engineTremoloLfo.type = "sine";
    engineTremoloLfo.frequency.value = 5.5;
    engineTremoloLfoGain = audio.createGain();
    engineTremoloLfoGain.gain.value = 0.06; // depth — oscillates the gain param by +/-0.06 around 1
    engineTremoloLfo.connect(engineTremoloLfoGain);
    engineTremoloLfoGain.connect(engineTremoloGain.gain);
    engineTremoloLfo.start();
    engineTremoloGain.connect(engineMasterGain);
    engineMasterGain.connect(audio.destination);

    // SUB — felt more than heard.
    engineSubOsc = audio.createOscillator();
    engineSubOsc.type = "sine";
    engineSubOsc.frequency.value = 42;
    engineSubGain = audio.createGain();
    engineSubGain.gain.value = 0;
    engineSubOsc.connect(engineSubGain);
    engineSubGain.connect(engineTremoloGain);
    engineSubOsc.start();

    // RUMBLE — the main body of the roar.
    engineRumbleSource = audio.createBufferSource();
    engineRumbleSource.buffer = createBrownNoiseBuffer(audio);
    engineRumbleSource.loop = true;
    engineRumbleFilter = audio.createBiquadFilter();
    engineRumbleFilter.type = "bandpass";
    engineRumbleFilter.frequency.value = 90;
    engineRumbleFilter.Q.value = 0.7;
    engineRumbleGain = audio.createGain();
    engineRumbleGain.gain.value = 0;
    engineRumbleSource.connect(engineRumbleFilter);
    engineRumbleFilter.connect(engineRumbleGain);
    engineRumbleGain.connect(engineTremoloGain);
    engineRumbleSource.start();

    // HISS — the exhaust/turbulence texture the earlier passes lacked.
    engineHissSource = audio.createBufferSource();
    engineHissSource.buffer = createWhiteNoiseBuffer(audio);
    engineHissSource.loop = true;
    engineHissFilter = audio.createBiquadFilter();
    engineHissFilter.type = "highpass";
    engineHissFilter.frequency.value = 2200;
    engineHissGain = audio.createGain();
    engineHissGain.gain.value = 0;
    engineHissPanner = audio.createStereoPanner();
    enginePanLfo = audio.createOscillator();
    enginePanLfo.type = "sine";
    enginePanLfo.frequency.value = 0.35;
    enginePanLfoGain = audio.createGain();
    enginePanLfoGain.gain.value = 0.25;
    enginePanLfo.connect(enginePanLfoGain);
    enginePanLfoGain.connect(engineHissPanner.pan);
    enginePanLfo.start();
    engineHissSource.connect(engineHissFilter);
    engineHissFilter.connect(engineHissGain);
    engineHissGain.connect(engineHissPanner);
    engineHissPanner.connect(engineTremoloGain);
    engineHissSource.start();

    // GROWL — gritty tonal layer (distorted, not just filtered).
    engineGrowlOsc1 = audio.createOscillator();
    engineGrowlOsc1.type = "sawtooth";
    engineGrowlOsc1.frequency.value = 48;
    engineGrowlOsc2 = audio.createOscillator();
    engineGrowlOsc2.type = "sawtooth";
    engineGrowlOsc2.frequency.value = 48;
    engineGrowlOsc2.detune.value = 9; // slight beating — width, not a flat single-oscillator beep
    engineGrowlFilter = audio.createBiquadFilter();
    engineGrowlFilter.type = "lowpass";
    engineGrowlFilter.frequency.value = 220;
    engineGrowlShaper = audio.createWaveShaper();
    // WaveShaperNode.curve's DOM typing wants Float32Array<ArrayBuffer>
    // specifically; `new Float32Array(n)` types as the more general
    // Float32Array<ArrayBufferLike> in current TS DOM lib typings, even
    // though it's really backed by a plain ArrayBuffer at runtime.
    engineGrowlShaper.curve = makeSoftClipCurve(6) as Float32Array<ArrayBuffer>;
    engineGrowlShaper.oversample = "2x";
    engineGrowlGain = audio.createGain();
    engineGrowlGain.gain.value = 0;
    engineGrowlOsc1.connect(engineGrowlFilter);
    engineGrowlOsc2.connect(engineGrowlFilter);
    engineGrowlFilter.connect(engineGrowlShaper);
    engineGrowlShaper.connect(engineGrowlGain);
    engineGrowlGain.connect(engineTremoloGain);
    engineGrowlOsc1.start();
    engineGrowlOsc2.start();
  }

  // Local non-null aliases — the module-level `let`s above are
  // reassigned by stopEngineSound() from a different call, so TS can't
  // narrow them as non-null across statements the way plain locals
  // would be; the lazy-init block just above guarantees all of these
  // are set by this point in the same call.
  const master = engineMasterGain;
  const subOsc = engineSubOsc!;
  const subGain = engineSubGain!;
  const rumbleFilter = engineRumbleFilter!;
  const rumbleGain = engineRumbleGain!;
  const hissFilter = engineHissFilter!;
  const hissGain = engineHissGain!;
  const growlOsc1 = engineGrowlOsc1!;
  const growlOsc2 = engineGrowlOsc2!;
  const growlFilter = engineGrowlFilter!;
  const growlGain = engineGrowlGain!;

  const now = audio.currentTime;
  const idle = clamped <= 0.02;
  // A faint idle presence even at a standstill (barely audible) so the
  // engine reads as "always running," rising clearly once the ship
  // actually starts moving and climbing further under Boost.
  master.gain.setTargetAtTime(idle ? 0.055 : 0.1 + clamped * 0.2, now, 0.15);

  subOsc.frequency.setTargetAtTime(42 + clamped * 20, now, 0.15);
  subGain.gain.setTargetAtTime(idle ? 0.35 : 0.55 + clamped * 0.35, now, 0.15);

  rumbleFilter.frequency.setTargetAtTime(90 + clamped * 260, now, 0.12);
  rumbleGain.gain.setTargetAtTime(idle ? 0.22 : 0.35 + clamped * 0.3, now, 0.15);

  // Hiss is the layer most tied to "moving fast" specifically — near
  // silent at idle, climbing the most sharply of any layer with speed.
  hissFilter.frequency.setTargetAtTime(2600 - clamped * 900, now, 0.15);
  hissGain.gain.setTargetAtTime(idle ? 0.02 : 0.05 + clamped * 0.22, now, 0.18);

  const growlFreq = 48 + clamped * 95;
  // setTargetAtTime (exponential approach), not setValueAtTime — a hard
  // jump every frame is exactly what produces the clicking/zipper noise
  // this smooths away.
  growlOsc1.frequency.setTargetAtTime(growlFreq, now, 0.08);
  growlOsc2.frequency.setTargetAtTime(growlFreq, now, 0.08);
  growlFilter.frequency.setTargetAtTime(220 + clamped * 700, now, 0.1);
  growlGain.gain.setTargetAtTime(idle ? 0.1 : 0.22 + clamped * 0.28, now, 0.12);
}

export function stopEngineSound() {
  const audio = getCtx();
  const master = engineMasterGain;
  const stoppable = [
    engineTremoloLfo,
    engineSubOsc,
    engineRumbleSource,
    engineHissSource,
    enginePanLfo,
    engineGrowlOsc1,
    engineGrowlOsc2,
  ].filter((n): n is AudioBufferSourceNode | OscillatorNode => n !== null);
  engineMasterGain = null;
  engineTremoloGain = null;
  engineTremoloLfo = null;
  engineTremoloLfoGain = null;
  engineSubOsc = null;
  engineSubGain = null;
  engineRumbleSource = null;
  engineRumbleFilter = null;
  engineRumbleGain = null;
  engineHissSource = null;
  engineHissFilter = null;
  engineHissGain = null;
  engineHissPanner = null;
  enginePanLfo = null;
  enginePanLfoGain = null;
  engineGrowlOsc1 = null;
  engineGrowlOsc2 = null;
  engineGrowlFilter = null;
  engineGrowlShaper = null;
  engineGrowlGain = null;
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
