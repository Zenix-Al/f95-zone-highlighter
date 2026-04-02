//this is just collection of unused instruments, not registered in the instrument.js file.

import { noteToFreq } from ".";

// They can be used for testing or as a source of inspiration for new instruments.
export function makeBreathyInstrument() {
  return function play(ctx, when, dur, vel = 1, params = {}) {
    const now = when;
    let baseFreq = params.freq || noteToFreq(params.pitch || 69);

    const osc = ctx.createOscillator();
    osc.type = params.oscType || "triangle";

    // === MAGIC: if you set isMoan: true, it becomes your original moan ===
    if (params.isMoan === true) {
      // your exact original pitch movement
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(320 * (params.intensity || 1), now + dur * 0.4);
      osc.frequency.exponentialRampToValueAtTime(500, now + dur);
    } else {
      osc.frequency.setValueAtTime(baseFreq, now);
    }

    // vibrato (always sexy)
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = params.vibratoHz || (params.isMoan ? 5 + Math.random() * 3 : 6);
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = params.vibratoDepth || (params.isMoan ? 10 : 8);
    lfo.connect(lfoGain).connect(osc.frequency);

    // gain envelope — moan style when isMoan, normal when not
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    if (params.isMoan) {
      g.gain.exponentialRampToValueAtTime(0.4 * vel, now + 0.25);
      g.gain.setValueAtTime(0.4 * vel, now + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    } else {
      const { a = 0.02, d = 0.04, s = 0.7, r = 0.06 } = params.adsr || {};
      g.gain.exponentialRampToValueAtTime(0.35 * vel, now + a);
      g.gain.exponentialRampToValueAtTime(0.35 * vel * s, now + a + d);
      g.gain.setValueAtTime(0.35 * vel * s, now + Math.max(0, dur - r));
      g.gain.exponentialRampToValueAtTime(0.001, now + dur + r);
    }

    // breath noise
    const buffer = ctx.createBuffer(1, ctx.sampleRate * Math.min(0.4, dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.35;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const nf = ctx.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.value = params.breathFreq || 800;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.15 * vel, now + 0.1);
    ng.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(g).connect(ctx.destination);
    noise.connect(nf).connect(ng).connect(ctx.destination);

    lfo.start(now);
    lfo.stop(now + dur + 0.1);
    osc.start(now);
    osc.stop(now + dur + 0.2);
    noise.start(now + 0.1);
    noise.stop(now + dur);

    return now + dur + 0.3;
  };
}

export function makeWaterInstrument() {
  return function play(ctx, when, dur, vel = 1, params = {}) {
    const now = when;
    const level = (params.level || 0.25) * vel;

    // noise source for water body
    const bufLen = Math.max(1, Math.floor(ctx.sampleRate * (Math.min(0.5, dur) + dur)));
    const buffer = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.45;
    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = params.hp || 200;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = params.lp || 5000;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = params.bpFreq || 1800;
    bp.Q.value = params.bpQ || 0.6;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, level), now + Math.min(0.05, dur * 0.08));
    g.gain.setValueAtTime(Math.max(0.001, level), now + Math.max(0, dur - 0.06));
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur + 0.02);

    // slow movement LFO on bandpass center
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = params.lfoFreq || 0.15 + Math.random() * 0.6;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = params.lfoDepth || bp.frequency.value * 0.08;
    lfo.connect(lfoGain).connect(bp.frequency);

    // small droplets (sine chirps)
    const drops = Math.max(0, Math.floor(dur * 5));
    const dropStops = [];
    for (let i = 0; i < drops; i++) {
      const t = now + Math.random() * dur;
      const o = ctx.createOscillator();
      o.type = "sine";
      const dg = ctx.createGain();
      dg.gain.setValueAtTime(0.0001, t);
      dg.gain.linearRampToValueAtTime(0.12 * vel, t + 0.002);
      dg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12 + Math.random() * 0.08);
      const f0 = 1200 + Math.random() * 1800;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(600 + Math.random() * 500, t + 0.12);
      o.connect(dg).connect(g);
      o.start(t);
      o.stop(t + 0.18);
      dropStops.push(t + 0.18);
    }

    // chain
    src.connect(hp);
    hp.connect(lp);
    lp.connect(bp);
    bp.connect(g);
    g.connect(ctx.destination);

    lfo.start(now);
    lfo.stop(now + dur + 0.1);
    src.start(now);
    src.stop(now + Math.min(bufLen / ctx.sampleRate, dur + 0.1));

    const last = Math.max(now + dur, ...dropStops, now + dur + 0.02);
    return last + 0.05;
  };
}

export function makeSlimeInstrument() {
  return function play(ctx, when, dur, vel = 1, params = {}) {
    const now = when;
    const level = (params.level || 0.28) * vel;

    // noise base
    const buffer = ctx.createBuffer(
      1,
      Math.floor(ctx.sampleRate * Math.min(0.5, dur)),
      ctx.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    const src = ctx.createBufferSource();
    src.buffer = buffer;

    // squelchy bandpass
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = params.baseFreq || 320;
    bp.Q.value = params.q || 6;

    // small wobble LFO
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = params.lfoFreq || 0.6 + Math.random() * 1.2;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = params.lfoDepth || 80;
    lfo.connect(lfoGain).connect(bp.frequency);

    // gain envelope
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, level), now + Math.min(0.04, dur * 0.08));
    g.gain.setValueAtTime(Math.max(0.001, level), now + Math.max(0, dur - 0.06));
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur + 0.02);

    // simple feedback delay for wetness
    const delay = ctx.createDelay();
    delay.delayTime.value = params.delayTime || 0.06;
    const fb = ctx.createGain();
    fb.gain.value = params.feedback || 0.45;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = params.feedbackLow || 1200;

    // connect feedback loop: delay -> lp -> fb -> delay
    delay.connect(lp);
    lp.connect(fb);
    fb.connect(delay);

    // connect chain: src -> bp -> g -> destination and also -> delay (wet)
    src.connect(bp);
    bp.connect(g);
    g.connect(ctx.destination);
    g.connect(delay);
    delay.connect(ctx.destination);

    // globs: low pitched sine slides
    const globs = Math.max(1, Math.floor(dur * 1.6));
    const globStops = [];
    for (let i = 0; i < globs; i++) {
      const t = now + Math.random() * dur * 0.9;
      const o = ctx.createOscillator();
      o.type = params.globType || "sine";
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(0.22 * vel, t + 0.01);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.24 + Math.random() * 0.18);
      const f0 = 160 + Math.random() * 160;
      o.frequency.setValueAtTime(f0 * (1 + Math.random() * 0.2), t);
      o.frequency.exponentialRampToValueAtTime(
        Math.max(60, f0 * 0.3),
        t + 0.22 + Math.random() * 0.18,
      );
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 0.5 + Math.random() * 0.3);
      globStops.push(t + 0.5 + Math.random() * 0.3);
    }

    lfo.start(now);
    lfo.stop(now + dur + 0.1);
    src.start(now);
    src.stop(now + Math.min(buffer.length / ctx.sampleRate, dur));

    const last = Math.max(now + dur, ...globStops, now + dur + 0.02);
    return last + 0.05;
  };
}

export function makeSimpleInstrument() {
  return function play(ctx, when, dur = 0.18, vel = 1, params = {}) {
    const now = when;
    const freq = params.freq || noteToFreq(params.pitch || 69);

    const o = ctx.createOscillator();
    o.type = params.oscType || "sine";
    o.frequency.setValueAtTime(freq, now);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.22 * vel, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur + 0.02);

    o.connect(g).connect(ctx.destination);
    o.start(now);
    o.stop(now + dur + 0.05);

    return now + dur + 0.06;
  };
}

export function makeGlassChime() {
  return (ctx, when, dur, vel = 1, params = {}) => {
    const now = when;
    const osc = ctx.createOscillator();
    osc.type = params.oscType || "sine";
    osc.frequency.setValueAtTime(noteToFreq(params.pitch || "C6"), now);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.exponentialRampToValueAtTime(0.45 * vel, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);

    // high sparkle
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(1800, now);
    filter.frequency.exponentialRampToValueAtTime(4200, now + dur * 0.6);

    osc.connect(filter).connect(g).connect(ctx.destination);

    osc.start(now);
    osc.stop(now + dur + 0.1);

    return now + dur + 0.12;
  };
}

export function makeSilkyWhoosh() {
  return (ctx, when, dur, vel = 1, params = {}) => {
    const now = when;

    // noise sweep for that sexy “whoosh in/out”
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur * 1.2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(params.startFreq || 2200, now);
    filter.frequency.exponentialRampToValueAtTime(params.endFreq || 180, now + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.exponentialRampToValueAtTime(0.38 * vel, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur + 0.08);

    noise.connect(filter).connect(g).connect(ctx.destination);

    noise.start(now);
    noise.stop(now + dur + 0.2);

    return now + dur + 0.25;
  };
}

export function makeElectricClick() {
  return (ctx, when, dur, vel = 1, params = {}) => {
    const now = when;

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(noteToFreq(params.pitch || "G5"), now);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.exponentialRampToValueAtTime(0.55 * vel, now + 0.003);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 2800;

    osc.connect(filter).connect(g).connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);

    return now + 0.18;
  };
}

export function makeZapActivate() {
  return (ctx, when, dur, vel = 1, params = {}) => {
    const now = when;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(noteToFreq("C4"), now);
    osc.frequency.exponentialRampToValueAtTime(noteToFreq("C6"), now + dur * 0.6);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.exponentialRampToValueAtTime(0.5 * vel, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(g).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.1);

    return now + dur + 0.15;
  };
}

export function makeHumDeactivate() {
  return (ctx, when, dur, vel = 1, params = {}) => {
    const now = when;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(noteToFreq("C5"), now);
    osc.frequency.exponentialRampToValueAtTime(noteToFreq("C3"), now + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4 * vel, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(g).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.1);

    return now + dur + 0.12;
  };
}
