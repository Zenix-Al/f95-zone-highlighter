import stateManager from "../../config.js";
import {
  initTagSearchListeners,
  renderExcluded,
  renderMarked,
  renderPreferred,
} from "../components/tag-search/index.js";
import { renderSettingsSection } from "../renderers/settingsSection";
import { handleModalClick, handleOutsideSearchClick } from "../components/listeners";
import { injectModal } from "../components/modal";
import { addListener } from "../../core/listenerRegistry";
import { showToast } from "../components/toast";
import { openConfirmDialog } from "../components/dialog.js";
import {
  syncAddonPanels,
  renderAddinsOverview,
  syncPinnedAddonNav,
} from "../components/addons/sync.js";
import { ADDON_STATUS_META } from "../components/addons/renderer.js";
import { colorSettingsMeta } from "./colorSettings";
import { globalSettingsMeta } from "./globalSettings";
import { latestSettingsMeta } from "./latestSettings";
import { threadSettingsMeta } from "./threadSettings";
import { ADDON_COMMAND_EVENT } from "../../services/addons/shared.js";
import {
  invokeAddonCoreAction,
  listKnownAddons,
  removeAddonInstallationTrace,
  subscribeAddonsRegistry,
} from "../../services/addonsService.js";
import { showAllTags, updateSearch, updateTags } from "../../services/tagsService";
import { checkTags } from "../../services/safetyService";

const DEFAULT_SETTINGS_PANEL = "settings-panel-general";
const SETTINGS_ACTIVE_PANEL_STORAGE_KEY = "settingsUiActivePanel";
const SETTINGS_PINNED_ADDONS_STORAGE_KEY = "settingsUiPinnedAddonIds";
let addonsRegistryUnsubscribe = null;

function isMobileSettingsViewport() {
  try {
    return Boolean(window.matchMedia && window.matchMedia("(max-width: 760px)").matches);
  } catch {
    return false;
  }
}

function setMobileShellView(shadowRoot, showPanel) {
  const shell = shadowRoot?.querySelector?.(".settings-shell");
  const mobileHeader = shadowRoot?.getElementById?.("settings-mobile-panel-header");
  if (!shell) return;

  if (!isMobileSettingsViewport()) {
    shell.classList.remove("mobile-show-panel");
    if (mobileHeader) mobileHeader.hidden = true;
    return;
  }

  shell.classList.toggle("mobile-show-panel", Boolean(showPanel));
  if (mobileHeader) mobileHeader.hidden = !Boolean(showPanel);
}

function buildAddonPanelId(addonId) {
  return `settings-panel-addon-${String(addonId || "")
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()}`;
}

function normalizeAddonEntry(addon) {
  if (!addon || typeof addon !== "object") return null;

  const id = String(addon.id || "")
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  const name = String(addon.name || "").trim();
  if (!id || !name) return null;

  return {
    id,
    name,
    version: String(addon.version || "0.0.0").trim() || "0.0.0",
    description:
      String(addon.description || "No description provided yet.").trim() ||
      "No description provided yet.",
    status: ADDON_STATUS_META[addon.status] ? addon.status : "installed",
    statusMessage: String(addon.statusMessage || "").trim(),
    panelTitle: String(addon.panelTitle || addon.name || "").trim() || name,
    panelBody: String(addon.panelBody || "").trim(),
    panelSettingsTitle: String(addon.panelSettingsTitle || "").trim(),
    panelSettingsDescription: String(addon.panelSettingsDescription || "").trim(),
    panelSettingsStorageKey:
      String(addon.panelSettingsStorageKey || "settings").trim() || "settings",
    panelSettingsDefaults:
      addon.panelSettingsDefaults && typeof addon.panelSettingsDefaults === "object"
        ? addon.panelSettingsDefaults
        : {},
    panelSettings: Array.isArray(addon.panelSettings) ? addon.panelSettings : [],
    panelActions: Array.isArray(addon.panelActions) ? addon.panelActions : [],
    panelToastLabel: String(addon.panelToastLabel || "").trim(),
    panelToastMessage: String(addon.panelToastMessage || "").trim(),
    capabilities: Array.isArray(addon.capabilities) ? [...addon.capabilities] : [],
    trusted: Boolean(addon.trusted),
    blocked: Boolean(addon.blocked),
    activeOnPage: Boolean(addon.activeOnPage),
    installedSeenAt: Number(addon.installedSeenAt || 0),
    supportsCurrentPage: addon.supportsCurrentPage !== false,
    catalogFresh: addon.catalogFresh !== false,
    pageScopes: Array.isArray(addon.pageScopes) ? [...addon.pageScopes] : [],
    downloadUrl: String(addon.downloadUrl || "").trim(),
    panelId: buildAddonPanelId(id),
  };
}

function setSettingByPath(target, path, value) {
  const parts = String(path || "")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return target;
  const root = target && typeof target === "object" ? { ...target } : {};
  let cursor = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    const next = cursor[key];
    cursor[key] = next && typeof next === "object" ? { ...next } : {};
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = value;
  return root;
}

function getRegisteredAddons() {
  return listKnownAddons().map(normalizeAddonEntry).filter(Boolean);
}

function getAddonById(addonId) {
  return getRegisteredAddons().find((addon) => addon.id === addonId) || null;
}

function getPinnedAddonIds() {
  const pinned = stateManager.get("settingsPinnedAddonIds");
  if (!Array.isArray(pinned)) return [];
  return [...new Set(pinned.map((id) => String(id || "").trim()).filter(Boolean))];
}

async function persistSettingsUiValue(key, value) {
  try {
    await GM.setValue(key, value);
  } catch (error) {
    console.warn(`[settings-ui] Failed to persist ${key}:`, error);
  }
}

async function ensureSettingsUiPrefsLoaded() {
  if (stateManager.get("settingsUiPrefsLoaded")) return;

  let activePanel = DEFAULT_SETTINGS_PANEL;
  let pinnedAddonIds = [];

  try {
    activePanel = String(
      await GM.getValue(SETTINGS_ACTIVE_PANEL_STORAGE_KEY, DEFAULT_SETTINGS_PANEL),
    );
  } catch {}

  try {
    const storedPins = await GM.getValue(SETTINGS_PINNED_ADDONS_STORAGE_KEY, []);
    if (Array.isArray(storedPins)) {
      pinnedAddonIds = storedPins.map((id) => String(id || "").trim()).filter(Boolean);
    }
  } catch {}

  stateManager.set("settingsActivePanel", activePanel || DEFAULT_SETTINGS_PANEL);
  stateManager.set("settingsPinnedAddonIds", [...new Set(pinnedAddonIds)]);
  stateManager.set("settingsUiPrefsLoaded", true);
}

function movePinnedAddon(addonId, direction) {
  const pinnedIds = getPinnedAddonIds();
  const currentIndex = pinnedIds.indexOf(addonId);
  if (currentIndex < 0) return pinnedIds;

  const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (nextIndex < 0 || nextIndex >= pinnedIds.length) return pinnedIds;

  const reordered = [...pinnedIds];
  const [movedId] = reordered.splice(currentIndex, 1);
  reordered.splice(nextIndex, 0, movedId);
  return reordered;
}

function setActivePanel(
  shadowRoot,
  targetId,
  { persist = true, resetScroll = true, showMobilePanel = true } = {},
) {
  const navItems = [...shadowRoot.querySelectorAll(".settings-nav-item[data-target]")];
  const panels = [...shadowRoot.querySelectorAll(".settings-panel")];
  if (navItems.length === 0 || panels.length === 0) return;

  const panelIds = new Set(panels.map((panel) => panel.id));
  const nextPanelId = panelIds.has(targetId) ? targetId : DEFAULT_SETTINGS_PANEL;

  navItems.forEach((item) => {
    const isActive = item.dataset.target === nextPanelId;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-current", isActive ? "page" : "false");
  });

  panels.forEach((panel) => {
    const isActive = panel.id === nextPanelId;
    panel.classList.toggle("active", isActive);
    if (isActive && resetScroll) panel.scrollTop = 0;
  });

  stateManager.set("settingsActivePanel", nextPanelId);
  if (persist) {
    void persistSettingsUiValue(SETTINGS_ACTIVE_PANEL_STORAGE_KEY, nextPanelId);
  }

  const activeNav = navItems.find((item) => item.dataset.target === nextPanelId);
  const mobileTitle = shadowRoot.getElementById("settings-mobile-title");
  if (mobileTitle) {
    mobileTitle.textContent = String(activeNav?.textContent || "Settings").trim() || "Settings";
  }
  setMobileShellView(shadowRoot, showMobilePanel);
}

function syncSettingsSidebarNavigation(shadowRoot) {
  const activePanelId = String(stateManager.get("settingsActivePanel") || DEFAULT_SETTINGS_PANEL);
  const activePanelBeforeSync = shadowRoot.getElementById(activePanelId);
  const preservedScrollTop = Number(activePanelBeforeSync?.scrollTop || 0);
  const shell = shadowRoot.querySelector(".settings-shell");
  const keepMobilePanelOpen = Boolean(shell?.classList?.contains("mobile-show-panel"));

  syncAddonPanels(shadowRoot, getRegisteredAddons, getPinnedAddonIds);
  syncPinnedAddonNav(shadowRoot, getRegisteredAddons, getPinnedAddonIds);
  renderAddinsOverview(shadowRoot, getRegisteredAddons, getPinnedAddonIds);
  setActivePanel(shadowRoot, activePanelId, {
    persist: false,
    resetScroll: false,
    showMobilePanel: keepMobilePanelOpen,
  });

  const activePanelAfterSync = shadowRoot.getElementById(activePanelId);
  if (activePanelAfterSync) {
    activePanelAfterSync.scrollTop = preservedScrollTop;
  }
}

function initSettingsSidebarNavigation(shadowRoot) {
  const nav = shadowRoot.getElementById("settings-nav");
  if (!nav || nav.dataset.initBound) return;

  const mobileBackBtn = shadowRoot.getElementById("settings-mobile-back");
  const mobileCloseBtn = shadowRoot.getElementById("settings-mobile-close");

  setMobileShellView(shadowRoot, false);

  nav.addEventListener("click", (event) => {
    const target = event.target?.closest?.(".settings-nav-item[data-target]");
    if (!target) return;
    const targetPanelId = String(target.dataset.target || "").trim();
    setActivePanel(shadowRoot, targetPanelId);
  });

  mobileBackBtn?.addEventListener("click", () => {
    setMobileShellView(shadowRoot, false);
  });

  mobileCloseBtn?.addEventListener("click", () => {
    shadowRoot.getElementById("close-modal")?.click();
  });

  window.addEventListener("resize", () => {
    if (!isMobileSettingsViewport()) {
      setMobileShellView(shadowRoot, false);
    }
  });

  nav.dataset.initBound = "1";
}

function initAddinsPanelActions(shadowRoot) {
  const addinsPanel = shadowRoot.getElementById("settings-panel-addins");
  const settingsMain = shadowRoot.querySelector(".settings-main");
  if (!addinsPanel || !settingsMain || addinsPanel.dataset.initBound) return;

  addinsPanel.addEventListener("click", async (event) => {
    const actionButton = event.target?.closest?.("[data-addon-action][data-addon-id]");
    if (!actionButton) return;

    const addonId = String(actionButton.dataset.addonId || "").trim();
    if (!addonId) return;

    if (actionButton.dataset.addonAction === "open-addon-panel") {
      const addon = getAddonById(addonId);
      if (addon?.status === "not-installed") {
        showToast("Install this add-on before opening its panel.");
        return;
      }
      setActivePanel(shadowRoot, buildAddonPanelId(addonId));
      return;
    }

    if (actionButton.dataset.addonAction === "open-addon-download") {
      const addon = getRegisteredAddons().find((a) => a.id === addonId);
      if (addon?.downloadUrl) {
        window.open(addon.downloadUrl, "_blank", "noopener,noreferrer");
      }
      return;
    }

    if (actionButton.dataset.addonAction === "toggle-addon-pin") {
      const addon = getAddonById(addonId);
      if (!addon || addon.status === "not-installed") {
        showToast("Install this add-on before pinning it.");
        return;
      }

      const nextPins = new Set(getPinnedAddonIds());
      if (nextPins.has(addonId)) {
        nextPins.delete(addonId);
      } else {
        nextPins.add(addonId);
      }

      const orderedPins = [...nextPins];
      stateManager.set("settingsPinnedAddonIds", orderedPins);
      await persistSettingsUiValue(SETTINGS_PINNED_ADDONS_STORAGE_KEY, orderedPins);
      syncSettingsSidebarNavigation(shadowRoot);
      return;
    }

    if (actionButton.dataset.addonAction === "move-addon-pin-up") {
      const addon = getAddonById(addonId);
      if (!addon || addon.status === "not-installed") return;

      const nextPins = movePinnedAddon(addonId, "up");
      stateManager.set("settingsPinnedAddonIds", nextPins);
      await persistSettingsUiValue(SETTINGS_PINNED_ADDONS_STORAGE_KEY, nextPins);
      syncSettingsSidebarNavigation(shadowRoot);
      return;
    }

    if (actionButton.dataset.addonAction === "move-addon-pin-down") {
      const addon = getAddonById(addonId);
      if (!addon || addon.status === "not-installed") return;

      const nextPins = movePinnedAddon(addonId, "down");
      stateManager.set("settingsPinnedAddonIds", nextPins);
      await persistSettingsUiValue(SETTINGS_PINNED_ADDONS_STORAGE_KEY, nextPins);
      syncSettingsSidebarNavigation(shadowRoot);
      return;
    }

    if (actionButton.dataset.addonAction === "toggle-addon-feature") {
      const addon = getAddonById(addonId);
      if (!addon || addon.status === "not-installed") {
        showToast("Add-on action failed: addon_not_registered");
        return;
      }

      const action = addon.status === "disabled" ? "feature.enable" : "feature.disable";
      const result = await invokeAddonCoreAction(addonId, action, {});
      if (!result.ok) {
        showToast(`Add-on action failed: ${result.reason || "unknown"}`);
        return;
      }
      updateRegisteredAddons(listKnownAddons());
      return;
    }

    if (actionButton.dataset.addonAction === "delete-addon-trace") {
      const addon = getAddonById(addonId);
      if (!addon || addon.status === "not-installed") {
        showToast("Nothing to delete.");
        return;
      }
      if (addon.activeOnPage) {
        showToast("Cannot delete while add-on is active on this page.");
        return;
      }

      const confirmed = await openConfirmDialog({
        title: "Delete Add-on Trace",
        description: `Delete installed trace for "${addon.name}"? This removes stale status from Add-ins.`,
        confirmLabel: "Delete Trace",
        cancelLabel: "Cancel",
      });
      if (!confirmed) return;

      const result = await removeAddonInstallationTrace(addonId);
      if (!result?.ok) {
        showToast(`Delete failed: ${result?.reason || "unknown"}`);
        return;
      }

      const nextPins = getPinnedAddonIds().filter((id) => id !== addonId);
      stateManager.set("settingsPinnedAddonIds", nextPins);
      await persistSettingsUiValue(SETTINGS_PINNED_ADDONS_STORAGE_KEY, nextPins);
      updateRegisteredAddons(listKnownAddons());
      showToast("Add-on trace deleted.");
    }
  });

  settingsMain.addEventListener("click", async (event) => {
    const actionButton = event.target?.closest?.("[data-addon-action][data-addon-id]");
    if (!actionButton) return;

    const addonId = String(actionButton.dataset.addonId || "").trim();
    if (!addonId) return;

    if (actionButton.dataset.addonAction === "back-to-addins") {
      setActivePanel(shadowRoot, "settings-panel-addins");
      return;
    }

    if (actionButton.dataset.addonAction === "toggle-addon-feature") {
      const addon = getRegisteredAddons().find((a) => a.id === addonId);
      const action = addon?.status === "disabled" ? "feature.enable" : "feature.disable";
      const result = await invokeAddonCoreAction(addonId, action, {});
      if (!result.ok) {
        showToast(`Add-on action failed: ${result.reason || "unknown"}`);
        return;
      }
      updateRegisteredAddons(listKnownAddons());
      return;
    }

    if (actionButton.dataset.addonAction === "trigger-addon-toast") {
      const message = String(actionButton.dataset.toastMessage || "").trim();
      if (!message) return;
      const result = await invokeAddonCoreAction(addonId, "toast.show", { message });
      if (!result.ok) {
        showToast(`Add-in action failed: ${result.reason || "unknown"}`);
      }
      return;
    }

    if (actionButton.dataset.addonAction === "trigger-addon-command") {
      const addon = getAddonById(addonId);
      const actionId = String(actionButton.dataset.addonCommandId || "").trim();
      const requiresActivePage = actionButton.dataset.requiresActivePage !== "0";
      if (!actionId) return;

      if (requiresActivePage && !addon?.activeOnPage) {
        showToast("This add-on is idle on this page.");
        return;
      }

      window.dispatchEvent(
        new CustomEvent(ADDON_COMMAND_EVENT, {
          detail: {
            addonId,
            command: "panel-action",
            actionId,
          },
        }),
      );
    }
  });

  settingsMain.addEventListener("change", async (event) => {
    const toggle = event.target?.closest?.(
      "[data-addon-action='toggle-addon-setting'][data-addon-id]",
    );
    if (!toggle) return;

    const addonId = String(toggle.dataset.addonId || "").trim();
    const path = String(toggle.dataset.addonSettingPath || "").trim();
    if (!addonId || !path) return;

    const addon = getAddonById(addonId);
    if (!addon) return;

    const readResult = await invokeAddonCoreAction(addonId, "storage.get", {
      key: addon.panelSettingsStorageKey || "settings",
      defaultValue: addon.panelSettingsDefaults || {},
    });
    if (!readResult?.ok) {
      showToast(`Failed to read add-on settings: ${readResult?.reason || "unknown"}`);
      toggle.checked = !toggle.checked;
      return;
    }

    const current =
      readResult.value && typeof readResult.value === "object"
        ? readResult.value
        : addon.panelSettingsDefaults || {};
    const next = setSettingByPath(current, path, Boolean(toggle.checked));

    const writeResult = await invokeAddonCoreAction(addonId, "storage.set", {
      key: addon.panelSettingsStorageKey || "settings",
      value: next,
    });
    if (!writeResult?.ok) {
      showToast(`Failed to save add-on settings: ${writeResult?.reason || "unknown"}`);
      toggle.checked = !toggle.checked;
      return;
    }

    const refreshResult = await invokeAddonCoreAction(addonId, "feature.refresh", {});
    if (!refreshResult?.ok) {
      showToast(`Setting saved but live apply failed: ${refreshResult?.reason || "unknown"}`);
    }
  });

  addinsPanel.dataset.initBound = "1";
}

export function updateRegisteredAddons(addons) {
  const source = Array.isArray(addons) && addons.length > 0 ? addons : listKnownAddons();
  const normalized = source.map(normalizeAddonEntry).filter(Boolean);
  const byId = new Map(normalized.map((addon) => [addon.id, addon]));

  const validIds = new Set(normalized.map((addon) => addon.id));
  const nextPins = getPinnedAddonIds().filter((id) => {
    if (!validIds.has(id)) return false;
    const addon = byId.get(id);
    return addon?.status !== "not-installed";
  });
  stateManager.set("settingsPinnedAddonIds", nextPins);
  void persistSettingsUiValue(SETTINGS_PINNED_ADDONS_STORAGE_KEY, nextPins);

  const shadowRoot = stateManager.get("shadowRoot");
  if (shadowRoot) {
    syncSettingsSidebarNavigation(shadowRoot);
  }
}

function initAddonsRegistryBridge() {
  if (addonsRegistryUnsubscribe) return;
  addonsRegistryUnsubscribe = subscribeAddonsRegistry(() => {
    updateRegisteredAddons(listKnownAddons());
  });
}

export async function initModalUi() {
  await ensureSettingsUiPrefsLoaded();
  initAddonsRegistryBridge();

  if (!stateManager.get("modalInjected")) {
    stateManager.set("modalInjected", true);
    injectModal();

    const injectedShadowRoot = stateManager.get("shadowRoot");
    if (!injectedShadowRoot) return;

    initSettingsSidebarNavigation(injectedShadowRoot);
    initAddinsPanelActions(injectedShadowRoot);

    const searchInput = injectedShadowRoot.getElementById("tags-search");
    if (searchInput) {
      addListener("tags-search-input", searchInput, "input", updateSearch);
      addListener("tags-search-focus", searchInput, "focus", (e) => {
        if (e.target.value.trim()) {
          updateSearch(e);
        } else {
          showAllTags();
        }
      });
    }

    initTagSearchListeners();

    const modal = injectedShadowRoot.getElementById("tag-config-modal");
    if (modal) {
      addListener("modal-delegated-click", modal, "click", handleModalClick);
    }

    addListener("outside-search-click", document, "click", handleOutsideSearchClick);
  }

  const shadowRoot = stateManager.get("shadowRoot");
  if (!shadowRoot) return;

  updateRegisteredAddons(listKnownAddons());
  syncSettingsSidebarNavigation(shadowRoot);

  if (!stateManager.get("globalSettingsRendered")) {
    stateManager.set("globalSettingsRendered", true);
    renderSettingsSection("global-settings-container", globalSettingsMeta);
  }
  if (!stateManager.get("colorRendered")) {
    stateManager.set("colorRendered", true);
    renderSettingsSection("color-container", colorSettingsMeta);
  }
  if (!stateManager.get("overlayRendered")) {
    stateManager.set("overlayRendered", true);
    updateLatestUI();
  }
  if (!stateManager.get("threadSettingsRendered")) {
    stateManager.set("threadSettingsRendered", true);
    updateThreadUI();
  }
  if (!stateManager.get("tagsUpdateRan")) {
    stateManager.set("tagsUpdateRan", true);
    (async () => {
      try {
        const result = await updateTags();
        if (result?.pruned && result.count > 0) {
          showToast(`${result.count} obsolete tag(s) removed from your lists.`);
        }
        renderPreferred();
        renderExcluded();
        renderMarked();
        checkTags();
      } catch (err) {
        console.warn("updateTags failed:", err);
      }
    })();
  }
}

export function updateLatestUI() {
  renderSettingsSection("latest-settings-container", latestSettingsMeta);
}

export function updateThreadUI() {
  renderSettingsSection("thread-settings-container", threadSettingsMeta);
}
