import { capitalize } from "prelude-ls";
import { state } from "../constants";
import { showToast } from "../ui/modal";

export function applyEffects(meta, value) {
  if (meta.effects?.reapply) {
    state[`reapply${capitalize(meta.effects.reapply)}`] = true;
  }

  if (meta.effects?.toast) {
    showToast(meta.effects.toast(value));
  }

  meta.effects?.custom?.(value);
}
