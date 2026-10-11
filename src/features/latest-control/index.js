import { createFeature } from "../../core/featureFactory.js";
import { config } from "../../config.js";
import { addObserverCallback, removeObserverCallback } from "../../core/observer.js";
import { SELECTORS } from "../../config/selectors.js";
import { TIMINGS } from "../../config/timings.js";
import { debugLog } from "../../core/logger.js";
import { createEnabledDisabledToast, createToggleSetting } from "../../ui/settings/metaFactory.js";

const pendingTimers = new Set();
let mutationSyncTimer = null;
const CONTROL_DISCOVERY_SELECTOR = `${SELECTORS.TILE.ROOT}, #${SELECTORS.LATEST_CONTROL.IDS.AUTO_REFRESH}, #${SELECTORS.LATEST_CONTROL.IDS.NOTIFY}`;

function schedule(callback, delay) {
  const timer = setTimeout(() => {
    pendingTimers.delete(timer);
    callback();
  }, delay);
  pendingTimers.add(timer);
  return timer;
}

function clearPendingTimers() {
  for (const timer of pendingTimers) clearTimeout(timer);
  pendingTimers.clear();
  mutationSyncTimer = null;
}

/**
 * Main handler to synchronize the state of on-page UI controls
 * (Auto-Refresh, Web Notifications) with the script's configuration.
 * This function understands the dependency that Web Notifications require Auto-Refresh.
 */
function syncLatestControls({ allowDelayedWebNotif = true } = {}) {
  const autoRefreshBtn = document.getElementById(SELECTORS.LATEST_CONTROL.IDS.AUTO_REFRESH);
  const webNotifBtn = document.getElementById(SELECTORS.LATEST_CONTROL.IDS.NOTIFY);
  debugLog("Latest Controls Sync", "Syncing control states with configuration...", {
    autoRefreshBtn: !!autoRefreshBtn,
    webNotifBtn: !!webNotifBtn,
    targetAutoRefresh: config.latestSettings.autoRefresh,
    targetWebNotif: config.latestSettings.webNotif,
  });
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

  if (allowDelayedWebNotif && !isWebNotifOn && targetWebNotif) {
    schedule(() => {
      if (config.latestSettings.webNotif && !webNotifBtn.classList.contains("selected")) {
        webNotifBtn.click();
      }
    }, TIMINGS.LATEST_CONTROL_WEBNOTIF_DELAY);
  }
}

/**
 * Newly rendered cards signal that the site has reset its existing controls.
 * Coalesce pagination batches; hover content and overlay decorations are ignored.
 * @param {MutationRecord[]} mutationsList
 */
function processMutations() {
  if (mutationSyncTimer !== null) return;
  mutationSyncTimer = schedule(() => {
    mutationSyncTimer = null;
    syncLatestControls();
  }, 100);
}

function hasLatestControlMutations(mutationsList) {
  return mutationsList.some(
    (mutation) =>
      Array.from(mutation.addedNodes || []).some(
        (node) =>
          node.nodeType === 1 &&
          (node.matches?.(CONTROL_DISCOVERY_SELECTOR) ||
            node.querySelector?.(CONTROL_DISCOVERY_SELECTOR)),
      ),
  );
}

function enable() {
  syncLatestControls();
  addObserverCallback("sync-latest-controls", processMutations, {
    filter: hasLatestControlMutations,
    healthId: "Latest Controls Sync",
  });
}

function disable() {
  removeObserverCallback("sync-latest-controls");
  clearPendingTimers();
  syncLatestControls({ allowDelayedWebNotif: false });
}

export const latestControlFeature = createFeature("Latest Controls Sync", {
  isEnabled: () => config.latestSettings.autoRefresh || config.latestSettings.webNotif,
  pageScopes: ["isLatest"],
  isApplicable: ({ stateManager }) => stateManager.get("isLatest"),
  enable: enable,
  disable: disable,
  settingsUi: {
    id: "latest-control",
    sectionId: "latest",
    metaMaps: [
      {
        autoRefresh: createToggleSetting({
          text: "Auto Refresh",
          tooltip: "Auto activate in site auto refresh for the Latest Updates page",
          config: "latestSettings.autoRefresh",
          custom: () => {
            latestControlFeature.sync();
          },
          toast: createEnabledDisabledToast("Auto Refresh"),
        }),
      },
      {
        webNotif: createToggleSetting({
          text: "Web Notifications",
          tooltip:
            "Auto activate in site web notifications for new threads (site might ask for permission)",
          config: "latestSettings.webNotif",
          custom: () => {
            latestControlFeature.sync();
          },
          toast: createEnabledDisabledToast("Web Notifications"),
        }),
      },
    ],
  },
});
