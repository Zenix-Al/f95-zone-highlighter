import { config, state } from "../config";
import { debugLog } from "../core/logger";

export function checkTags() {
  // Log for debugging, as requested.
  debugLog("[tag check]", `Tag length ${config.tags.length}`);
  if (!state.shadowRoot) return;
  const el = state.shadowRoot.getElementById("tag-error-notif");
  if (!el) return; // Element might not be rendered yet

  const noTagsMessage = "No tag detected, go to f95zone latest page and open this menu again.";

  if (config.tags.length === 0) {
    tagsErrorNotif(noTagsMessage);
  } else {
    // Only clear the message if it's the one we set.
    if (el.textContent === noTagsMessage) {
      tagsErrorNotif("");
    }
  }
}

function _updateErrorNotif(elementId, text) {
  if (!state.shadowRoot) return;
  const el = state.shadowRoot.getElementById(elementId);
  if (!el) return;
  el.textContent = text || "";
  el.style.display = text ? "block" : "none";
}

export function colorErrorNotif(text) {
  _updateErrorNotif("color-error-notif", text);
}

export function tagsErrorNotif(text) {
  _updateErrorNotif("tag-error-notif", text);
}
export function checkOverlaySettings() {
  const overlayMessage = "Both Latest and Thread overlay are disabled, nothing will be applied.";

  if (!config.latestSettings.latestOverlayToggle && !config.threadSettings.threadOverlayToggle) {
    colorErrorNotif(overlayMessage);
    tagsErrorNotif(overlayMessage);
  } else {
    colorErrorNotif("");

    if (!state.shadowRoot) return;
    const el = state.shadowRoot.getElementById("tag-error-notif");
    // Only clear the message if it's the one we set, to avoid conflicts with checkTags.
    if (el && el.textContent === overlayMessage) {
      tagsErrorNotif("");
    }
  }
}
