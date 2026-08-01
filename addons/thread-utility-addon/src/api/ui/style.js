import { byteLength, THREAD_UTILITY_LIMITS } from "../../domain/limits.js";

export function registerStyle(core, styleId, cssText) {
  if (byteLength(cssText) > THREAD_UTILITY_LIMITS.stylesheetBytes) {
    return Promise.resolve({ ok: false, reason: "stylesheet_too_large" });
  }
  return core.invokeCoreAction("ui.style.register", { styleId, cssText });
}

export function unregisterStyle(core, styleId) {
  return core.invokeCoreAction("ui.style.unregister", { styleId });
}
