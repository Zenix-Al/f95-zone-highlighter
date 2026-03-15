import { createFeature } from "../../core/featureFactory.js";
import { config } from "../../config.js";
import { addObserverCallback, removeObserverCallback } from "../../core/observer.js";
import { SELECTORS } from "../../config/selectors.js";
import TIMINGS from "../../config/timings.js";

/**
 * Main handler to synchronize the state of on-page UI controls
 * (Auto-Refresh, Web Notifications) with the script's configuration.
 * This function understands the dependency that Web Notifications require Auto-Refresh.
 */
function syncLatestControls() {
  const autoRefreshBtn = document.getElementById(SELECTORS.LATEST_CONTROL.IDS.AUTO_REFRESH);
  const webNotifBtn = document.getElementById(SELECTORS.LATEST_CONTROL.IDS.NOTIFY);

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
    }, TIMINGS.LATEST_CONTROL_WEBNOTIF_DELAY);
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

function hasLatestControlMutations(mutationsList) {
  return mutationsList.some((mutation) => {
    for (const node of mutation.addedNodes || []) {
      if (node.nodeType !== 1) continue;
      if (node.id === SELECTORS.LATEST_CONTROL.IDS.AUTO_REFRESH) return true;
      if (node.id === SELECTORS.LATEST_CONTROL.IDS.NOTIFY) return true;
      if (node.querySelector?.(`#${SELECTORS.LATEST_CONTROL.IDS.AUTO_REFRESH}`)) return true;
      if (node.querySelector?.(`#${SELECTORS.LATEST_CONTROL.IDS.NOTIFY}`)) return true;
    }
    return false;
  });
}

function enable() {
  syncLatestControls();
  addObserverCallback("sync-latest-controls", processMutations, {
    filter: hasLatestControlMutations,
  });
}

function disable() {
  removeObserverCallback("sync-latest-controls");
  syncLatestControls();
}

export const latestControlFeature = createFeature("Latest Controls Sync", {
  isEnabled: () => config.latestSettings.autoRefresh || config.latestSettings.webNotif,
  isApplicable: ({ stateManager }) => stateManager.get("isLatest"),
  enable: enable,
  disable: disable,
});
