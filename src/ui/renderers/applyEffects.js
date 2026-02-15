import { showToast } from "../components/toast.js";
import { toastToggle } from "../../utils/helpers.js";

export function applyEffects(meta, value) {
  //reapply is legacy code, must be moved to metadata approach

  if (meta.effects?.toast) {
    const msg = meta.effects.toast(value);
    if (typeof msg === "string" && /(.*)\s+(enabled|disabled)$/.test(msg)) {
      // Extract name portion before the final ' enabled'/' disabled'
      const name = msg.replace(/\s+(enabled|disabled)$/, "");
      toastToggle(name, Boolean(value));
    } else {
      showToast(msg);
    }
  }

  meta.effects?.custom?.(value);
}
