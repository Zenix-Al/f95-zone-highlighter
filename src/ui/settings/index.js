import { config, state } from "../../config";
import { renderExcluded, renderPreferred } from "../components/tag-search";
import { renderSettingsSection } from "../renderers/settingsSection";
import { injectListener } from "../components/listeners";
import { injectModal, showToast } from "../components/modal";
import { colorSettingsMeta } from "./colorSettings";
import { globalSettingsMeta } from "./globalSettings";
import { latestSettingsMeta } from "./latestSettings";
import { disabledOverlaySettingsMeta, overlaySettingsMeta } from "./overlaySettings";
import {
  disabledThreadOverlayMeta,
  threadOverlaySettingsMeta,
  threadSettingsMeta,
} from "./threadSettings";
import { updateTags } from "../../services/tagsService";
import { checkTags } from "../../services/safetyService";

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

  // Kick off the tag update process, but don't wait for it.
  // The UI will be responsive, and the tag sections will populate when ready.
  updateTags().then((result) => {
    if (result?.pruned && result.count > 0) {
      showToast(`${result.count} obsolete tag(s) removed from your lists.`);
    }
    renderPreferred();
    renderExcluded();
    checkTags();
  });
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
