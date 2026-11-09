// Soft UI ticks (WebAudio sine blips) — the console-menu feel, no audio files needed.
import { readPrefs } from "../lib/prefs";
let ctx: AudioContext | null = null;

const SOUNDS: Record<string, [number, number, number, number?][]> = {
  // [freq, start, dur, gain]
  move: [[1250, 0, 0.035, 0.05]],
  select: [[880, 0, 0.05], [1320, 0.05, 0.08]],
  back: [[990, 0, 0.05], [660, 0.05, 0.08]],
  tab: [[1100, 0, 0.04, 0.05]],
  error: [[300, 0, 0.09], [240, 0.1, 0.12]],
  saved: [[784, 0, 0.07], [1047, 0.07, 0.07], [1568, 0.14, 0.14]],
  open: [[660, 0, 0.06], [990, 0.06, 0.06], [1320, 0.12, 0.1]],
};

export function sfx(name: keyof typeof SOUNDS) {
  if (typeof window === "undefined" || !readPrefs().sounds) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
    const t0 = ctx.currentTime;
    for (const [f, s, d, gain = 0.08] of SOUNDS[name]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + s);
      g.gain.exponentialRampToValueAtTime(gain, t0 + s + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + s + d);
      o.connect(g).connect(ctx.destination);
      o.start(t0 + s); o.stop(t0 + s + d + 0.02);
    }
  } catch {}
}
