// Synthesized, very soft UI sounds: no audio files. The context starts on the first pointer or key press
// (browsers block audio before that). M toggles mute; the choice is remembered per browser.
const KEY = "shiori:muted";
let ctx: AudioContext | null = null;
let lastTick = 0;
let muted = (() => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
})();

export function unlockAudio() {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
}

export const isMuted = () => muted;

export function toggleMute(): boolean {
  muted = !muted;
  try {
    localStorage.setItem(KEY, muted ? "1" : "0");
  } catch {}
  return muted;
}

/** A small wooden "tok" as a card passes the center. `intensity` 0–1 follows the spin speed. */
export function tick(intensity: number) {
  if (muted || !ctx || ctx.state !== "running") return;
  const now = ctx.currentTime;
  if (now - lastTick < 0.035) return;
  lastTick = now;
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(1050 + Math.random() * 140, now);
  osc.frequency.exponentialRampToValueAtTime(520, now + 0.05);
  filter.type = "lowpass";
  filter.frequency.value = 2200;
  const peak = 0.014 + 0.026 * Math.min(1, Math.max(0, intensity));
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peak, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);
  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.09);
}

/** A soft breath of filtered noise for opening a wiki. */
export function whoosh() {
  if (muted || !ctx || ctx.state !== "running") return;
  const now = ctx.currentTime;
  const length = 0.7;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * length), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 0.8;
  filter.frequency.setValueAtTime(300, now);
  filter.frequency.exponentialRampToValueAtTime(1600, now + 0.45);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.05, now + 0.18);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(now);
}
