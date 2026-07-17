import { showCoreToast } from "../../api/toast.js";

let coreAdaptor = null;

export function configureToast(core) {
  coreAdaptor = core;
}

export function showToast(message, type = "info") {
  if (!coreAdaptor) return Promise.resolve({ ok: false, reason: "not_configured" });
  return showCoreToast(coreAdaptor, message, type);
}
