import { applySurpriseTags } from "../domain/filterRoute.js";
import { selectSurpriseTags } from "../domain/surpriseTags.js";

export function createSurpriseController({
  getTagPrefs,
  getCurrentUrl = () => location.href,
  getBaseUrl = () => location.origin,
  isAvailable,
  applyMutation,
  onUnavailable,
  rng = Math.random,
} = {}) {
  function run() {
    if (!isAvailable?.()) {
      return { ok: false, reason: "inactive" };
    }
    const selection = selectSurpriseTags(getTagPrefs?.(), { rng });
    if (!selection.ok) {
      onUnavailable?.(selection.reason);
      return selection;
    }
    const mutation = applySurpriseTags(
      getCurrentUrl(),
      selection.tags.map((tag) => tag.id),
      getBaseUrl(),
    );
    applyMutation?.(mutation);
    return { ...selection, mutation };
  }

  return { run };
}
