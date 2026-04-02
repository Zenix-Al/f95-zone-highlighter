import { noteToFreq } from ".";
// Soft Chill UI Instruments – perfect for relaxed enhancer vibes

export function makeSoftChime() {
  return (ctx, when, dur, vel = 1, params = {}) => {
    const now = when;
    const osc = ctx.createOscillator();
    osc.type = params.oscType || "sine"; // warm and round
    osc.frequency.setValueAtTime(noteToFreq(params.pitch || "G5"), now);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.exponentialRampToValueAtTime(0.28 * vel, now + 0.03); // slow gentle attack
    g.gain.exponentialRampToValueAtTime(0.001, now + dur + 0.4); // long soft decay

    // light high-end sparkle without being harsh
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2800, now);

    osc.connect(filter).connect(g).connect(ctx.destination);

    osc.start(now);
    osc.stop(now + dur + 0.6);

    return now + dur + 0.7;
  };
}

export function makeGentleWhoosh() {
  return (ctx, when, dur, vel = 1, params = {}) => {
    const now = when;

    const buffer = ctx.createBuffer(1, ctx.sampleRate * (dur + 0.3), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.6;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(params.startFreq || 1600, now);
    filter.frequency.exponentialRampToValueAtTime(params.endFreq || 320, now + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.exponentialRampToValueAtTime(0.22 * vel, now + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur + 0.35);

    noise.connect(filter).connect(g).connect(ctx.destination);

    noise.start(now);
    noise.stop(now + dur + 0.5);

    return now + dur + 0.6;
  };
}

export function makeWarmBlip() {
  return (ctx, when, dur, vel = 1, params = {}) => {
    const now = when;
    const osc = ctx.createOscillator();
    osc.type = "triangle"; // super soft and rounded
    osc.frequency.setValueAtTime(noteToFreq(params.pitch || "E5"), now);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.exponentialRampToValueAtTime(0.32 * vel, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1800;

    osc.connect(filter).connect(g).connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);

    return now + 0.4;
  };
}

export function makeSoftFadeIn() {
  return (ctx, when, dur, vel = 1, params = {}) => {
    const now = when;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(noteToFreq(params.pitch || "C5"), now);
    osc.frequency.exponentialRampToValueAtTime(noteToFreq("G4"), now + dur * 0.7);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.exponentialRampToValueAtTime(0.25 * vel, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur + 0.2);

    osc.connect(g).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.3);

    return now + dur + 0.45;
  };
}
