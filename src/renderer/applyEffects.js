import { state } from "../constants";
import { showToast } from "../ui/modal";

const capitalize = (str) => {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export function applyEffects(meta, value) {
  //reapply is legacy code, must be moved to metadata approach

  if (meta.effects?.toast) {
    showToast(meta.effects.toast(value));
  }

  meta.effects?.custom?.(value);
}
