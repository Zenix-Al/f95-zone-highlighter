import { showToast } from "../ui/modal";

export function applyEffects(meta, value) {
  //reapply is legacy code, must be moved to metadata approach

  if (meta.effects?.toast) {
    showToast(meta.effects.toast(value));
  }

  meta.effects?.custom?.(value);
}
