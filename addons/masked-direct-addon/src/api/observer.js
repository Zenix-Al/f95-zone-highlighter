import { invokeOptionalCoreAction } from "../../../shared/apiFallback.js";

export function waitForElement(core, observerId, selector, timeoutMs, fallback) {
  return invokeOptionalCoreAction(
    core,
    "observer.waitFor",
    { observerId, selector, timeoutMs },
    fallback,
    Math.min(5000, Math.max(2500, Number(timeoutMs) + 500)),
  );
}

export function watchElements(core, observerId) {
  return core.invokeCoreAction("observer.watch", { observerId });
}

export function unwatchElements(core, observerId) {
  return core.invokeCoreAction("observer.unwatch", { observerId });
}