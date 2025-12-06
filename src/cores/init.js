import { state } from "../constants";
import { updateTags } from "../data/tags";
import { renderColorConfig } from "../renderer/color";
import { renderLatestSettings } from "../renderer/latestRenderer";
import { renderOverlaySettings } from "../renderer/overlay";
import { renderExcluded, renderPreferred } from "../renderer/searchTags";
import { renderThreadSettings } from "../renderer/threadSettings";
import { injectListener } from "../ui/listeners";
import { injectModal } from "../ui/modal";
import { wideForum } from "../ui/wideForum";
import { injectImageRepair } from "./imageHandler";
import { processAllTiles } from "./latest";
import { checkTags } from "./safety";
import { autoRefreshClick, processThreadTags, webNotifClick } from "./thread";

export function initModalUi() {
  if (!state.modalInjected) {
    state.modalInjected = true;
    injectModal();
    injectListener();
  }
  if (!state.colorRendered) {
    state.colorRendered = true;
    renderColorConfig();
  }
  if (!state.overlayRendered) {
    state.overlayRendered = true;
    renderLatestSettings();
    renderOverlaySettings();
  }
  if (!state.threadSettingsRendered) {
    state.threadSettingsRendered = true;
    renderThreadSettings();
  }

  renderPreferred();
  renderExcluded();
  updateTags();
  checkTags();
}

export function checkForUpdates() {
  if (state.isLatest && state.refreshNotification) {
    autoRefreshClick();
    webNotifClick();
  }
  if (state.refreshThread) {
    wideForum();
  }
  if (state.reapplyOverlay) {
    if (state.isThread) {
      processThreadTags();
      injectImageRepair();
    } else if (state.isLatest) {
      processAllTiles(true);
    }
  }
}
