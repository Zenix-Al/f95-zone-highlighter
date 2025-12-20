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

  // --- Masked link handling takes priority ---
  if (state.isMaskedLink) {
    if (config.threadSettings.skipMaskedLink) skipMaskedPage();
    return;
  }

  // --- Initialize UI ---
  initUI();

  // --- Global settings ---
  updateButtonVisibility();
  toggleCrossTabSync(config.globalSettings.enableCrossTabSync);

  // --- Page-specific functionality ---
  initPageState();
});
