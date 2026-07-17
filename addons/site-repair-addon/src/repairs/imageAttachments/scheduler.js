export function createCancellableScheduler({ setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const timers = new Map();
  let generation = 0;

  function schedule(id, callback, delayMs, expectedGeneration = generation) {
    cancel(id);
    const timer = setTimer(() => {
      timers.delete(id);
      if (expectedGeneration === generation) callback();
    }, Math.max(0, Number(delayMs) || 0));
    timers.set(id, timer);
    return id;
  }
  function cancel(id) {
    if (!timers.has(id)) return false;
    clearTimer(timers.get(id));
    timers.delete(id);
    return true;
  }
  function invalidate() {
    generation += 1;
    for (const id of [...timers.keys()]) cancel(id);
    return generation;
  }
  return { schedule, cancel, invalidate, getGeneration: () => generation, getSnapshot: () => [...timers.keys()] };
}
