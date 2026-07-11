const { Window } = require("happy-dom");

function createDomSandbox(url = "https://f95zone.to/threads/example.1/") {
  const window = new Window({ url });
  const previous = {};
  for (const key of ["window", "document", "HTMLElement", "Node", "CustomEvent", "Event", "MutationObserver", "location", "history", "navigator"]) {
    previous[key] = global[key];
    global[key] = window[key];
  }
  return {
    window,
    document: window.document,
    restore() { for (const [key, value] of Object.entries(previous)) global[key] = value; window.close(); },
  };
}

function createFakeGM(initial = {}, { failSet = false, failDelete = false } = {}) {
  const values = new Map(Object.entries(initial));
  const listeners = new Map();
  let nextId = 1;
  const emit = (key, oldValue, newValue, remote = false) => listeners.forEach((entry) => { if (entry.key === key) entry.listener(key, oldValue, newValue, remote); });
  return {
    async getValue(key, fallback) { return values.has(key) ? values.get(key) : fallback; },
    async setValue(key, value) { if (failSet) throw new Error("fake_set_failed"); const oldValue = values.get(key); values.set(key, value); emit(key, oldValue, value); },
    async deleteValue(key) { if (failDelete) throw new Error("fake_delete_failed"); const oldValue = values.get(key); values.delete(key); emit(key, oldValue, undefined); },
    addValueChangeListener(key, listener) { const id = nextId++; listeners.set(id, { key, listener }); return id; },
    removeValueChangeListener(id) { listeners.delete(id); },
    snapshot() { return Object.fromEntries(values); },
    emitRemote(key, value) { const oldValue = values.get(key); values.set(key, value); emit(key, oldValue, value, true); },
  };
}

function createFakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  const setTimeout = (callback, delay = 0) => { const id = nextId++; timers.set(id, { callback, at: now + Math.max(0, Number(delay) || 0) }); return id; };
  const clearTimeout = (id) => timers.delete(id);
  const tick = async (milliseconds = 0) => {
    const target = now + milliseconds;
    while (true) {
      const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > target) break;
      timers.delete(next[0]); now = next[1].at; await next[1].callback();
    }
    now = target;
  };
  return { setTimeout, clearTimeout, tick, pending: () => timers.size, now: () => now };
}

function dispatchPageTransition(window, type, persisted) {
  const event = new window.Event(type);
  Object.defineProperty(event, "persisted", { value: Boolean(persisted) });
  window.dispatchEvent(event);
  return event;
}

function createAddonBridgeTransport(window, eventName = "TEST-01:addon-bridge") {
  const requests = [];
  const send = (detail) => { requests.push(detail); window.dispatchEvent(new window.CustomEvent(eventName, { detail })); };
  const subscribe = (listener) => { window.addEventListener(eventName, listener); return () => window.removeEventListener(eventName, listener); };
  return { eventName, requests, send, subscribe };
}

module.exports = { createAddonBridgeTransport, createDomSandbox, createFakeClock, createFakeGM, dispatchPageTransition };
