import { config, state } from "./constants";
import { watchAndUpdateTiles } from "./cores/latest";
import { autoRefreshClick, processThreadTags, webNotifClick } from "./cores/thread";
import { updateColorStyle } from "./renderer/updateColorStyle";
import { loadData } from "./storage/save";
import { injectButton, injectCSS, updateButtonVisibility } from "./ui/modal";
import { detectPage, waitFor } from "./utils/waitFor";
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
  if (state.isLatest) {
    waitFor(() => document.getElementById("latest-page_items-wrap"))
      .then(() => {
        watchAndUpdateTiles();
      })
      .catch(() => {
        console.warn("Observer container not found on this page");
      });
    autoRefreshClick();
    webNotifClick();
  }
  if (state.isThread) {
    processThreadTags();
  }
});
