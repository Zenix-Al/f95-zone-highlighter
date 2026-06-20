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
