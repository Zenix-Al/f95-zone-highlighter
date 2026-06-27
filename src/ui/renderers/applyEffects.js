import { showToast } from "../components/toast.js";

export async function applyEffects(meta, value) {
  let suppressToast = false;
  if (typeof meta.effects?.custom === "function") {
    const customResult = await meta.effects.custom(value);
    suppressToast = customResult?.suppressToast === true;
  }

  if (!suppressToast && meta.effects?.toast) {
    const msg = meta.effects.toast(value);
    if (typeof msg === "string" && /(.*)\s+(enabled|disabled)$/.test(msg)) {
      // Extract name portion before the final ' enabled'/' disabled'
      const name = msg.replace(/\s+(enabled|disabled)$/, "");
      showToast(`${name} ${value ? "enabled" : "disabled"}`);
    } else {
      showToast(msg);
    }
  }
}
