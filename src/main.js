import { config, state } from "./constants";
import { watchAndUpdateTiles } from "./cores/latest";
import { processThreadTags } from "./cores/thread";
import { updateColorStyle } from "./renderer/updateColorStyle";
import { migrateLatestSettings } from "./storage/migrate";
import { loadData } from "./storage/save";
import { injectButton, injectCSS, updateButtonVisibility } from "./ui/modal";
import { wideForum } from "./ui/wideForum";
import { detectPage, waitFor } from "./utils/waitFor";

// IMAGE RETRY IMPORTS
import { injectImageRepair } from "./cores/imageHandler.js";

function waitForBody(callback) {
  if (document.body) {
    callback();
  } else {
    requestAnimationFrame(() => waitForBody(callback));
  }
}

waitForBody(async () => {
  Object.assign(config, await loadData());
  detectPage();
  injectCSS();
  injectButton();
  updateColorStyle();
  updateButtonVisibility();
  migrateLatestSettings();
  if (state.isLatest) {
    waitFor(() => document.getElementById("latest-page_items-wrap"))
      .then(() => {
        watchAndUpdateTiles();
      })
      .catch(() => {
        console.warn("Observer container not found on this page");
      });
  }

  // === THREAD LOGIC + IMAGE RETRY ===
  if (state.isThread) {
    processThreadTags();
    wideForum();
    injectImageRepair();
  }
});
