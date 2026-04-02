import { sound } from "../../core/sound/index.js";

// Lightweight MIDI-like helpers for calling the core `sound()` API.
// Sequence entry formats (arrays):
//  [t, voice, dur]
//  [t, voice, dur, vel]
//  [t, voice, pitch, dur, vel]
//  [t, voice, pitch, dur, vel, params]
// Or pass full event objects. Pitch will be moved into `params.pitch`.

function normalizeEvent(entry) {
  if (!Array.isArray(entry)) {
    const e = { ...entry };
    e.params = e.params || {};
    if (e.pitch != null) {
      e.params = { ...e.params, pitch: e.pitch };
      delete e.pitch;
    }
    return e;
  }

  const len = entry.length;
  const [t, voice] = entry;
  const ev = { t, voice, params: {} };

  if (len === 3) {
    ev.dur = entry[2];
  } else if (len === 4) {
    ev.dur = entry[2];
    ev.vel = entry[3];
  } else if (len === 5) {
    // [t, voice, pitch, dur, vel]
    ev.params = {};
    ev.params.pitch = entry[2];
    ev.dur = entry[3];
    ev.vel = entry[4];
  } else if (len >= 6) {
    // [t, voice, pitch, dur, vel, params]
    ev.params = entry[5] || {};
    if (entry[2] != null) ev.params.pitch = entry[2];
    ev.dur = entry[3];
    ev.vel = entry[4];
  }

  return ev;
}

function seqToEvents(seq) {
  return (seq || []).map(normalizeEvent);
}

export function midiPlay(metaOrSeq, maybeSeq) {
  const meta = Array.isArray(metaOrSeq) ? {} : metaOrSeq || {};
  const seq = Array.isArray(metaOrSeq) ? metaOrSeq : maybeSeq || [];
  const events = seqToEvents(seq);
  return sound(meta, events);
}

export function playModalOpen() {
  return midiPlay({ timeUnit: "s" }, [
    [0, "whoosh", null, 0.28, 0.75, { startFreq: 300, endFreq: 280 }],
    [0.08, "chime", "B5", 0.45, 0.85],
  ]);
}

export function playModalClose() {
  return midiPlay({ timeUnit: "s" }, [
    [0, "whoosh", null, 0.26, 0.7, { startFreq: 280, endFreq: 1350 }],
    [0.12, "blip", "D5", 0.18, 0.8],
  ]);
}

export function playSectionOpen() {
  return midiPlay({ timeUnit: "s" }, [
    [0, "whoosh", null, 0.32, 0.8, { startFreq: 1200, endFreq: 240 }],
  ]);
}

export function playSectionClosed() {
  return midiPlay({ timeUnit: "s" }, [
    [0, "whoosh", null, 0.29, 0.75, { startFreq: 240, endFreq: 1100 }],
  ]);
}

export function playActivated() {
  return midiPlay({ timeUnit: "s" }, [[0, "fade", "F5", 0.35, 0.9]]);
}

export function playDeactivated() {
  return midiPlay({ timeUnit: "s" }, [
    [0, "fade", "Eb4", 0.32, 0.75], // lower and calmer
  ]);
}

export function playToggled() {
  return midiPlay({ timeUnit: "s" }, [
    [0, "blip", "G5", 0.14, 0.85],
    [0.06, "blip", "Bb5", 0.11, 0.65],
  ]);
}
export default {
  midiPlay,
  playModalOpen,
  playModalClose,
};
