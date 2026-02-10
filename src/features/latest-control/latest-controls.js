import { config, state } from "../../config";
import { addObserverCallback, removeObserverCallback } from "../../core/observer";

/**
 * Main handler to synchronize the state of on-page UI controls
 * (Auto-Refresh, Web Notifications) with the script's configuration.
 * This function understands the dependency that Web Notifications require Auto-Refresh.
 */
function syncLatestControls() {
  const autoRefreshBtn = document.getElementById("controls_auto-refresh");
  const webNotifBtn = document.getElementById("controls_notify");

  // If controls aren't on the page yet, do nothing.
  if (!autoRefreshBtn || !webNotifBtn) return;

  const isAutoRefreshOn = autoRefreshBtn.classList.contains("selected");
  const isWebNotifOn = webNotifBtn.classList.contains("selected");

  // Determine the target state based on config, enforcing dependencies.
  // Web-notif requires auto-refresh. If auto-refresh is disabled in the config,
  // web-notif must also be treated as disabled, regardless of its own setting.
  const targetAutoRefresh = config.latestSettings.autoRefresh;
  const targetWebNotif = config.latestSettings.webNotif && targetAutoRefresh;

  // To respect dependencies, we must turn things on/off in a specific order.

  // Step 1: If web notifications need to be turned OFF, do it first.
  if (isWebNotifOn && !targetWebNotif) {
    webNotifBtn.click();
  }

  // Step 2: Sync the auto-refresh button to its target state.
  if (isAutoRefreshOn !== targetAutoRefresh) {
    autoRefreshBtn.click();
  }

  // Step 3: If web notifications need to be turned ON, do it last.
  // This ensures auto-refresh is enabled before we attempt to click the notification button.
  if (!isWebNotifOn && targetWebNotif) {
    // A small delay gives the site's JS time to process the auto-refresh click
    // and enable the notification button if it was disabled.
    setTimeout(() => {
      if (!webNotifBtn.classList.contains("selected")) {
        webNotifBtn.click();
      }
    }, 150);
  }
}

/**
 * Enables the feature to synchronize the state of on-page UI controls.
 */
export function enableLatestControls() {
  // This feature only runs on the "Latest Updates" page.
  if (!state.isLatest) return;

  // Run sync once immediately for any controls already present on the page.
  syncLatestControls();

  // Subscribe to the shared observer to handle cases where the controls
  // are added to the DOM dynamically.
  addObserverCallback("sync-latest-controls", processMutations);
}

/**
 * Disables the feature by unsubscribing from the shared observer and
 * ensuring the on-page controls are turned off.
 */
export function disableLatestControls() {
  if (!state.isLatest) return;
  removeObserverCallback("sync-latest-controls");
  // After disabling, run sync one last time. Since the config for both
  // should be false at this point, this will turn the page controls off.
  syncLatestControls();
}

/**
 * Toggles the entire feature on or off based on settings.
 * This should be called whenever autoRefresh or webNotif settings change.
 */
export function toggleLatestControls() {
  // The feature is needed if either setting is enabled.
  const isFeatureNeeded = config.latestSettings.autoRefresh || config.latestSettings.webNotif;

  if (isFeatureNeeded && state.isLatest) {
    enableLatestControls();
  } else {
    disableLatestControls();
  }
}

/**
 * Observer callback that checks if the relevant control buttons have been added to the DOM.
 * @param {MutationRecord[]} mutationsList
 */
function processMutations(mutationsList) {
  for (const mutation of mutationsList) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== 1) continue;

      // Check if the added node *is* or *contains* the controls.
      const hasControls =
        node.id === "controls_auto-refresh" ||
        node.id === "controls_notify" ||
        (node.querySelector &&
          (node.querySelector("#controls_auto-refresh") || node.querySelector("#controls_notify")));

      if (hasControls) {
        // Controls were added. Run the sync logic.
        syncLatestControls();
        return; // No need to check other mutations in this batch.
      }
    }
  }
}
