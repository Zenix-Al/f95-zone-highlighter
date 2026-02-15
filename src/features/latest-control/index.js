import { createFeature } from "../../core/featureFactory.js";
import { config } from "../../config.js";
import { addObserverCallback, removeObserverCallback } from "../../core/observer.js";

/**
 * Main handler to synchronize the state of on-page UI controls
 * (Auto-Refresh, Web Notifications) with the script's configuration.
 * This function understands the dependency that Web Notifications require Auto-Refresh.
 */
function syncLatestControls() {
  const autoRefreshBtn = document.getElementById("controls_auto-refresh");
  const webNotifBtn = document.getElementById("controls_notify");

  if (!autoRefreshBtn || !webNotifBtn) return;

  const isAutoRefreshOn = autoRefreshBtn.classList.contains("selected");
  const isWebNotifOn = webNotifBtn.classList.contains("selected");

  const targetAutoRefresh = config.latestSettings.autoRefresh;
  const targetWebNotif = config.latestSettings.webNotif && targetAutoRefresh;

  if (isWebNotifOn && !targetWebNotif) {
    webNotifBtn.click();
  }

  if (isAutoRefreshOn !== targetAutoRefresh) {
    autoRefreshBtn.click();
  }

  if (!isWebNotifOn && targetWebNotif) {
    setTimeout(() => {
      if (!webNotifBtn.classList.contains("selected")) {
        webNotifBtn.click();
      }
    }, 150);
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

      const hasControls =
        node.id === "controls_auto-refresh" ||
        node.id === "controls_notify" ||
        (node.querySelector &&
          (node.querySelector("#controls_auto-refresh") || node.querySelector("#controls_notify")));

      if (hasControls) {
        syncLatestControls();
        return; 
      }
    }
  }
}

function enable() {
  syncLatestControls();
  addObserverCallback("sync-latest-controls", processMutations);
}

function disable() {
  removeObserverCallback("sync-latest-controls");
  syncLatestControls();
}

export const latestControlFeature = createFeature("Latest Controls Sync", {
  isEnabled: () => config.latestSettings.autoRefresh || config.latestSettings.webNotif,
  enable: enable,
  disable: disable,
});
