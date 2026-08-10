// Lightweight Web Audio sound effects (no asset files needed).
// All tones are synthesized on the fly. A global mute flag is persisted to
// localStorage and exposed through a tiny external store so React components
// can subscribe with useSyncExternalStore.

const STORAGE_KEY = "dbl_muted";

let ctx: AudioContext | null = null;
let muted = false;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  muted = window.localStorage.getItem(STORAGE_KEY) === "1";
}

function audioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

/** Resume the audio context on a user gesture (required by mobile browsers). */
export function primeAudio() {
  audioCtx();
}

function tone(freq: number, dur: number, type: OscillatorType = "sine", gain = 0.14, when = 0) {
  if (muted) return;
  const a = audioCtx();
  if (!a) return;
  const t0 = a.currentTime + when;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function playTap() {
  // Soft, rounded pluck — gentle on the ears even with rapid taps.
  tone(523.25 + Math.random() * 40, 0.11, "sine", 0.06);
}

export function playClaim() {
  // Warm rising chime.
  [523.25, 659.25, 783.99].forEach((f, i) => tone(f, 0.22, "sine", 0.1, i * 0.08));
}

export function playSpinTick() {
  tone(880, 0.03, "sine", 0.035);
}

export function playWin() {
  // Mellow celebratory arpeggio, no harsh square/saw edges.
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.34, "sine", 0.11, i * 0.09));
  // gentle sparkle tail
  [1318.5, 1568.0].forEach((f, i) => tone(f, 0.26, "sine", 0.05, 0.36 + i * 0.06));
}

export function playError() {
  // Soft low blip instead of a harsh sawtooth buzz.
  tone(311.13, 0.18, "sine", 0.06);
}

export function isMuted() {
  return muted;
}

export function setMuted(next: boolean) {
  muted = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  }
  listeners.forEach((l) => l());
}

export function toggleMuted() {
  setMuted(!muted);
}

export function subscribeMuted(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
