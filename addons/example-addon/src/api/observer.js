export function watchObserver(core, observerId, options = {}) {
  return core.invokeCoreAction("observer.watch", {
    observerId,
    ...options,
  });
}

export function unwatchObserver(core, observerId) {
  return core.invokeCoreAction("observer.unwatch", {
    observerId,
  });
}

export function waitForObserver(core, observerId, selector, timeoutMs = 3000) {
  return core.invokeCoreAction("observer.waitFor", {
    observerId,
    selector,
    timeoutMs,
  }, Math.min(5000, Math.max(2500, Number(timeoutMs) + 500)));
}
