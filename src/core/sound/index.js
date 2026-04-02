import { makeSoftChime, makeGentleWhoosh, makeWarmBlip, makeSoftFadeIn } from "./instrument";

export function getAudioCtx() {
  if (!window.__f95_audio_ctx)
    window.__f95_audio_ctx = new (window.AudioContext || window.webkitAudioContext)();
  return window.__f95_audio_ctx;
}

export function noteToFreq(note) {
  /* same as before, unchanged */
  if (typeof note === "number") return 440 * Math.pow(2, (note - 69) / 12);
  const match = String(note).match(/^([A-G])([#b]?)(-?\d+)$/i);
  if (!match) return Number(note) || 440;
  const [, letter, acc, octaveS] = match;
  const octave = Number(octaveS);
  const semis = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter.toUpperCase()];
  const accidental = acc === "#" ? 1 : acc === "b" ? -1 : 0;
  const midi = (octave + 1) * 12 + semis + accidental;
  return noteToFreq(midi);
}

export async function sound(opts = {}, events = []) {
  const ctx = getAudioCtx();
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch (err) {
      console.warn("AudioContext resume failed:", err);
    }
  }

  const { bpm = 120, timeUnit = "beats", instruments = {} } = opts;
  const secondsPerBeat = 60 / bpm;
  const now = ctx.currentTime;
  const inst = Object.assign(
    {
      chime: makeSoftChime(),
      whoosh: makeGentleWhoosh(),
      blip: makeWarmBlip(),
      fade: makeSoftFadeIn(),
    },
    instruments,
  );

  let lastTime = now;

  for (const ev of events) {
    const tVal = timeUnit === "beats" ? ev.t * secondsPerBeat : ev.t;
    const when = now + (tVal || 0);
    const dur = ev.dur || 0.5;
    const vel = ev.vel ?? 1;
    const player = inst[ev.voice || "breath"];

    const params = { ...ev.params };
    if (ev.isMoan) params.isMoan = true;
    if (ev.intensity != null) params.intensity = ev.intensity;

    const stopAt = player(ctx, when, dur, vel, params);
    if (stopAt > lastTime) lastTime = stopAt;
  }

  const waitMs = Math.max(30, Math.ceil((lastTime - ctx.currentTime) * 1000));
  return new Promise((r) => setTimeout(r, waitMs));
}
