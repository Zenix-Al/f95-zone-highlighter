import { idbActions } from "./families/idb.js";
import { lifecycleActions } from "./families/lifecycle.js";
import { observerActions } from "./families/observer.js";
import { pageActions } from "./families/page.js";
import { storageActions } from "./families/storage.js";
import { toastActions } from "./families/toast.js";
import { uiActions } from "./families/ui.js";
import { getAction, getActionSnapshot, registerAction } from "./registry.js";

export const ACTION_FAMILIES = Object.freeze({
  lifecycle: lifecycleActions,
  storage: storageActions,
  idb: idbActions,
  observer: observerActions,
  page: pageActions,
  ui: uiActions,
  toast: toastActions,
});

export const PUBLIC_ACTION_IDS = Object.freeze(
  Object.values(ACTION_FAMILIES).flat().map((descriptor) => descriptor.id).sort(),
);

let composed = false;

export function assertActionCompositionComplete(snapshot = getActionSnapshot()) {
  const registered = snapshot.map((entry) => entry.id).sort();
  const unique = new Set(PUBLIC_ACTION_IDS);
  if (unique.size !== PUBLIC_ACTION_IDS.length) throw new Error("Duplicate public add-on action ID in composition.");
  if (registered.length !== PUBLIC_ACTION_IDS.length
    || registered.some((id, index) => id !== PUBLIC_ACTION_IDS[index])) {
    throw new Error(`Incomplete add-on action composition: expected ${PUBLIC_ACTION_IDS.join(",")}; registered ${registered.join(",")}.`);
  }
  return true;
}

export function ensureActionsRegistered() {
  if (!composed) {
    for (const descriptors of Object.values(ACTION_FAMILIES)) {
      for (const descriptor of descriptors) registerAction(descriptor);
    }
    composed = true;
  }
  assertActionCompositionComplete();
  return getActionSnapshot();
}

export function getComposedAction(id) {
  ensureActionsRegistered();
  return getAction(id);
}
