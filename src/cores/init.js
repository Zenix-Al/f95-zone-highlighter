import { state } from "../constants";
import { updateTags } from "../data/tags";
import { colorSettingsMeta } from "../meta/colorSettings";
import { globalSettingsMeta } from "../meta/globalSettings";
import { latestSettingsMeta } from "../meta/latestSettings";
import { overlaySettingsMeta } from "../meta/overlaySettings";
import { threadSettingsMeta } from "../meta/threadSettings";
import { renderExcluded, renderPreferred } from "../renderer/searchTags";
import { renderSettingsSection } from "../renderer/settingsSection";
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
  if (!state.globalSettingsRendered) {
    state.globalSettingsRendered = true;
    renderSettingsSection("global-settings-container", globalSettingsMeta);
  }
  if (!state.colorRendered) {
    state.colorRendered = true;
    renderSettingsSection("color-container", colorSettingsMeta);
  }
  if (!state.overlayRendered) {
    state.overlayRendered = true;
    renderSettingsSection("latest-settings-container", latestSettingsMeta);
    renderSettingsSection("overlay-settings-container", overlaySettingsMeta);
  }
  if (!state.threadSettingsRendered) {
    state.threadSettingsRendered = true;
    renderSettingsSection("thread-settings-container", threadSettingsMeta);
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
  if (state.refreshLayout) {
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
