import { config, state } from "../constants";
import { updateTags } from "../data/tags";
import { hijackMaskedLinks } from "../helper/maskedLinkSkipper";
import { colorSettingsMeta } from "../meta/colorSettings";
import { globalSettingsMeta } from "../meta/globalSettings";
import { latestSettingsMeta } from "../meta/latestSettings";
import { disabledOverlaySettingsMeta, overlaySettingsMeta } from "../meta/overlaySettings";
import {
  disabledThreadOverlayMeta,
  threadOverlaySettingsMeta,
  threadSettingsMeta,
} from "../meta/threadSettings";
import { renderExcluded, renderPreferred } from "../renderer/searchTags";
import { renderSettingsSection } from "../renderer/settingsSection";
import { updateColorStyle } from "../renderer/updateColorStyle";
import { injectListener } from "../ui/listeners";
import { injectButton, injectCSS, injectModal } from "../ui/modal";
import { wideForum } from "../ui/wideForum";
import { waitFor } from "../utils/waitFor";
import { injectImageRepair } from "./imageHandler";
import {
  handleWebClick,
  processAllTiles,
  toggleDenseLatestGrid,
  toggleWideLatestPage,
  watchAndUpdateTiles,
} from "./latest";
import { checkTags } from "./safety";
import { processThreadTags, signatureCollapse } from "./thread";

export function initUI() {
  injectCSS();
  injectButton();
  updateColorStyle();
}
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
    updateLatestUI();
  }
  if (!state.threadSettingsRendered) {
    state.threadSettingsRendered = true;
    updateThreadUI();
  }

  renderPreferred();
  renderExcluded();
  updateTags();
  checkTags();
}

export function updateLatestUI() {
  renderSettingsSection("latest-settings-container", latestSettingsMeta);
  if (config.latestSettings.latestOverlayToggle) {
    renderSettingsSection("overlay-settings-container", overlaySettingsMeta);
  } else {
    renderSettingsSection("overlay-settings-container", disabledOverlaySettingsMeta);
  }
}

export function updateThreadUI() {
  renderSettingsSection("thread-settings-container", threadSettingsMeta);
  if (config.threadSettings.threadOverlayToggle) {
    renderSettingsSection("thread-overlay-settings-container", threadOverlaySettingsMeta);
  } else {
    renderSettingsSection("thread-overlay-settings-container", disabledThreadOverlayMeta);
  }
}

export function toggleUIOverlayOverallSettings() {
  //disable color and tag settings UI
}

export async function initLatestPage() {
  try {
    await waitFor(() => document.getElementById("latest-page_items-wrap"));

    if (config.latestSettings.wideLatest) toggleWideLatestPage();
    watchAndUpdateTiles();
    if (config.latestSettings.denseLatestGrid) toggleDenseLatestGrid();
    processAllTiles();
    handleWebClick();
  } catch {
    console.warn("Observer container not found on latest page");
  }
}

export function initThreadPage() {
  if (config.threadSettings.threadOverlayToggle) processThreadTags();
  if (config.threadSettings.isWide) wideForum();
  if (config.threadSettings.imgRetry) injectImageRepair();
  if (config.threadSettings.collapseSignature) signatureCollapse();
  if (config.threadSettings.skipMaskedLink) hijackMaskedLinks();
}
export function initPageState() {
  if (state.isLatest) initLatestPage();
  if (state.isThread) initThreadPage();
}
