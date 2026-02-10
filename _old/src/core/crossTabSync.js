import { config, crossTabKeys, state } from "../constants";
import { applyEffects } from "./renderer/applyEffects";
import { metaRegistry } from "../features/settings/metaRegistry";

function initCrossTabSync() {
  Object.keys(crossTabKeys).forEach((key) => {
    GM_addValueChangeListener(key, (name, oldVal, newVal, remote) => {
      if (!remote) return;
      if (!config.latestSettings.enableCrossTabSync) return;
      state.isCrossTabSyncInitialized = true;
      handleSectionChange(key, oldVal, newVal);
    });
  });
}

function handleSectionChange(section, oldVal = {}, newVal = {}) {
  const metaMap = metaRegistry[section];
  if (!metaMap) return;

  Object.keys(newVal).forEach((subKey) => {
    if (oldVal?.[subKey] === newVal[subKey]) return;

    // Update local config
    config[section][subKey] = newVal[subKey];

    // Find meta by path
    const meta = metaMap[subKey];
    if (!meta) return;

    applyEffects(meta, newVal[subKey]);
  });
}

function disableCrossTabSync() {
  if (!state.isCrossTabSyncInitialized) return;

  Object.keys(crossTabKeys).forEach((key) => {
    GM_removeValueChangeListener(key);
  });
  state.isCrossTabSyncInitialized = false;
}

export function toggleCrossTabSync(enabled) {
  if (enabled) {
    initCrossTabSync();
  } else {
    disableCrossTabSync();
  }
}
