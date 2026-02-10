import { config, state } from "./config";
import { loadData } from "./services/settingsService";
import { updateButtonVisibility } from "./ui/components/modal";
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
  loadFeatures();
});
