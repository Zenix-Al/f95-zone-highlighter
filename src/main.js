import stateManager, { config } from "./config.js";
import { loadData } from "./services/settingsService";
import { updateButtonVisibility } from "./ui/components/configButton";
import { detectPage, waitForBody } from "./core/dom";

import { toggleCrossTabSync } from "./services/syncService";
import { initUI } from "./ui";
import { skipMaskedPage } from "./features/masked-link-skipper/index.js";
import { loadFeatures } from "./loader";

waitForBody(async () => {
  // --- Load user config ---
  Object.assign(config, await loadData());

  // --- Detect page type/state ---
  detectPage();

  // --- Preventing further unnecessary code execution ---
  if (stateManager.get('isMaskedLink')) {
    if (config.threadSettings.skipMaskedLink) skipMaskedPage();
    return;
  }

  // --- Initialize ---
  if (stateManager.get('isF95Zone')) {
    initUI();
    updateButtonVisibility();
    toggleCrossTabSync(config.globalSettings.enableCrossTabSync);
  }

  // --- Execute Page-specific functionality ---
  loadFeatures();
});
