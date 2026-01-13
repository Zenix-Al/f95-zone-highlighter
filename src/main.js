import { config, state } from "./constants";
import { migrateLatestSettings } from "./storage/migrate";
import { loadData } from "./storage/save";
import { updateButtonVisibility } from "./ui/modal";
import { detectPage, waitForBody } from "./utils/waitFor";

import { toggleCrossTabSync } from "./storage/crossTabSync.js";
import { initPageState, initUI } from "./cores/init.js";
import { skipMaskedPage } from "./helper/maskedLinkSkipper.js";

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
