import { config, crossTabKeys, state } from "../config";
import { applyEffects } from "../ui/renderers/applyEffects";
import { metaRegistry } from "../ui/settings/metaRegistry";

const listenerIds = [];

function initCrossTabSync() {
  // Prevent adding listeners multiple times
  if (state.isCrossTabSyncInitialized) return;

  Object.keys(crossTabKeys).forEach((key) => {
    const listenerId = GM_addValueChangeListener(key, (name, oldVal, newVal, remote) => {
      if (!remote) return;
      // The master switch for this feature is in globalSettings
      if (!config.globalSettings.enableCrossTabSync) return;
      handleSectionChange(key, oldVal, newVal);
    });
    listenerIds.push(listenerId);
  });
}

function handleSectionChange(section, oldVal = {}, newVal = {}) {
  const metaMap = metaRegistry[section];
  if (!metaMap) return;

  Object.keys(newVal).forEach((subKey) => {
    if (oldVal?.[subKey] === newVal[subKey]) return;

    // 1. Update the local in-memory config with the new value from the other tab.
    config[section][subKey] = newVal[subKey];

    // 2. Find the corresponding UI metadata for this setting.
    // We must search by the config path, as the meta key might not match the subKey.
    const fullPath = `${section}.${subKey}`;
    const metaEntry = Object.values(metaMap).find((meta) => meta.config === fullPath);
    if (!metaEntry) return; // No UI effect to apply for this setting.

    // 3. Trigger the same effects that would run if the user changed it in the local UI.
    applyEffects(metaEntry, newVal[subKey]);
  });
}

function disableCrossTabSync() {
  if (!state.isCrossTabSyncInitialized) return;

  listenerIds.forEach(GM_removeValueChangeListener);
  listenerIds.length = 0; // Clear the array of listener IDs
  state.isCrossTabSyncInitialized = false;
}

export function toggleCrossTabSync(enabled) {
  if (enabled) {
    initCrossTabSync();
    state.isCrossTabSyncInitialized = true;
  } else {
    disableCrossTabSync();
  }
}
