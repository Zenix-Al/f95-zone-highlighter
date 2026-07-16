export function watchImages(core, observerId, srcPrefix) {
  return core.invokeCoreAction("observer.watch", { observerId, srcPrefix });
}
export function unwatchImages(core, observerId) {
  return core.invokeCoreAction("observer.unwatch", { observerId });
}
