import { config, state } from "./constants";
import { migrateLatestSettings } from "./core/migrate";
import { loadData } from "./core/save";
import { updateButtonVisibility } from "./core/ui/modal";
import { detectPage, waitForBody } from "./core/waitFor";

import { toggleCrossTabSync } from "./core/crossTabSync.js";
import { initPageState, initUI } from "./core/init.js";
import { skipMaskedPage } from "./features/maskedLinkSkipper.js";

waitForBody(async () => {
  // --- Load user config ---
  Object.assign(config, await loadData());
  migrateLatestSettings();

  // --- Detect page type/state ---
  detectPage();

  // --- Preventing further unnecessary code execution ---
  if (state.isMaskedLink) {
    if (config.threadSettings.skipMaskedLink) skipMaskedPage();
    return;
  }

  // --- Initialize ---
  if (state.isF95Zone) {
    initUI();
    updateButtonVisibility();
    toggleCrossTabSync(config.globalSettings.enableCrossTabSync);
  }

  // --- Execute Page-specific functionality ---
  initPageState();
});
