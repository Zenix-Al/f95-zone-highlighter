import { stateManager } from "../../../config.js";
import { addListener } from "../../../core/listenerRegistry";
import { showToast } from "../toast.js";
import { openConfirmDialog } from "../dialog.js";
import { ADDON_COMMAND_EVENT } from "../../../services/addons/shared.js";
import {
  invokeAddonCoreAction,
  listKnownAddons,
  removeAddonInstallationTrace,
  subscribeAddonsRegistry,
} from "../../../services/addonsService.js";
import { ADDON_STATUS_META, getSettingByPath } from "./index.js";
import {
  persistSettingsUiValue,
  SETTINGS_PINNED_ADDONS_STORAGE_KEY,
} from "../../settingsRuntime/prefs.js";

let addonsRegistryUnsubscribe = null;

export function buildAddonPanelId(addonId) {
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
    isTrusted: Boolean(addon.isTrusted ?? addon.trusted),
    trustSource: String(addon.trustSource || "none").trim(),
    identityStatus: String(addon.identityStatus || "unresolved").trim(),
    isEnabled: addon.isEnabled !== false,
    isBlocked: Boolean(addon.isBlocked ?? addon.blocked),
    blockReason: String(addon.blockReason || "").trim(),
    canEnable: addon.canEnable !== false,
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
    const part = parts[i];
    const next = cursor[part];
    cursor[part] = next && typeof next === "object" ? { ...next } : {};
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]] = value;
  return root;
}

export function getRegisteredAddons() {
  const addons = stateManager.get("registeredAddons");
  return Array.isArray(addons) ? addons : [];
}

export function getAddonById(addonId) {
  return getRegisteredAddons().find((addon) => addon.id === addonId) || null;
}

export function getPinnedAddonIds() {
  const pinned = stateManager.get("settingsPinnedAddonIds");
  if (!Array.isArray(pinned)) return [];
  return [...new Set(pinned.map((id) => String(id || "").trim()).filter(Boolean))];
}

export function movePinnedAddon(addonId, direction) {
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

export function updateRegisteredAddons(addons, { refreshAddonsUi } = {}) {
  const source = Array.isArray(addons) && addons.length > 0 ? addons : listKnownAddons();
  const normalized = source.map(normalizeAddonEntry).filter(Boolean);
  const byId = new Map(normalized.map((addon) => [addon.id, addon]));

  const validIds = new Set(normalized.map((addon) => addon.id));
  const nextPins = getPinnedAddonIds().filter((id) => {
    if (!validIds.has(id)) return false;
    const addon = byId.get(id);
    return addon?.status !== "not-installed";
  });

  stateManager.set("registeredAddons", normalized);
  stateManager.set("settingsPinnedAddonIds", nextPins);
  void persistSettingsUiValue(SETTINGS_PINNED_ADDONS_STORAGE_KEY, nextPins);

  if (typeof refreshAddonsUi === "function") {
    refreshAddonsUi();
  }
}

export function initAddonsRegistryBridge({ onRegistryUpdate } = {}) {
  if (addonsRegistryUnsubscribe) return;
  addonsRegistryUnsubscribe = subscribeAddonsRegistry(() => {
    if (typeof onRegistryUpdate === "function") {
      onRegistryUpdate(listKnownAddons());
    }
  });
}

export function initAddinsPanelActions(
  shadowRoot,
  { setActivePanel, refreshAddonsUi },
) {
  const addinsPanel = shadowRoot.getElementById("settings-panel-addins");
  const settingsMain = shadowRoot.querySelector(".settings-main");
  if (!addinsPanel || !settingsMain || settingsMain.dataset.addinsActionsBound) return;

  const rerenderAddonsUi = () => {
    if (typeof refreshAddonsUi === "function") {
      refreshAddonsUi();
    }
  };

  const clickActionHandlers = {
    "open-addon-panel": async ({ addonId }) => {
      const addon = getAddonById(addonId);
      if (addon?.status === "not-installed") {
        showToast("Install this add-on before opening its panel.");
        return;
      }
      setActivePanel(buildAddonPanelId(addonId));
    },
    "open-addon-download": async ({ addonId }) => {
      const addon = getRegisteredAddons().find((entry) => entry.id === addonId);
      if (addon?.downloadUrl) {
        window.open(addon.downloadUrl, "_blank", "noopener,noreferrer");
      }
    },
    "toggle-addon-pin": async ({ addonId }) => {
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
      rerenderAddonsUi();
    },
    "move-addon-pin-up": async ({ addonId }) => {
      const addon = getAddonById(addonId);
      if (!addon || addon.status === "not-installed") return;

      const nextPins = movePinnedAddon(addonId, "up");
      stateManager.set("settingsPinnedAddonIds", nextPins);
      await persistSettingsUiValue(SETTINGS_PINNED_ADDONS_STORAGE_KEY, nextPins);
      rerenderAddonsUi();
    },
    "move-addon-pin-down": async ({ addonId }) => {
      const addon = getAddonById(addonId);
      if (!addon || addon.status === "not-installed") return;

      const nextPins = movePinnedAddon(addonId, "down");
      stateManager.set("settingsPinnedAddonIds", nextPins);
      await persistSettingsUiValue(SETTINGS_PINNED_ADDONS_STORAGE_KEY, nextPins);
      rerenderAddonsUi();
    },
    "toggle-addon-feature": async ({ addonId }) => {
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

      updateRegisteredAddons(listKnownAddons(), { refreshAddonsUi });
    },
    "delete-addon-trace": async ({ addonId }) => {
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
        title: "Delete Add-on Trace?",
        description:
          "This only removes the installation trace used to track add-on state. It does not remove the add-on script from your browser.",
        confirmLabel: "Delete trace",
        cancelLabel: "Cancel",
      });
      if (!confirmed) return;

      removeAddonInstallationTrace(addonId);
      updateRegisteredAddons(listKnownAddons(), { refreshAddonsUi });
      showToast("Add-on trace deleted.");
    },
    "back-to-addins": async () => {
      setActivePanel("settings-panel-addins");
    },
    "trigger-addon-toast": async ({ addonId, actionButton }) => {
      const message = String(actionButton.dataset.toastMessage || "").trim();
      if (!message) return;
      const result = await invokeAddonCoreAction(addonId, "toast.show", { message });
      if (!result.ok) {
        showToast(`Add-in action failed: ${result.reason || "unknown"}`);
      }
    },
    "trigger-addon-command": async ({ addonId, actionButton }) => {
      const addon = getAddonById(addonId);
      const addonCommandId = String(actionButton.dataset.addonCommandId || "").trim();
      const requiresActivePage = actionButton.dataset.requiresActivePage !== "0";
      if (!addonCommandId) return;

      if (requiresActivePage && !addon?.activeOnPage) {
        showToast("This add-on is idle on this page.");
        return;
      }

      window.dispatchEvent(
        new CustomEvent(ADDON_COMMAND_EVENT, {
          detail: {
            addonId,
            command: "panel-action",
            actionId: addonCommandId,
          },
        }),
      );
    },
  };

  addListener("settings-addins-main-click", settingsMain, "click", async (event) => {
    const actionButton = event.target?.closest?.("[data-addon-action][data-addon-id]");
    if (!actionButton) return;

    const addonId = String(actionButton.dataset.addonId || "").trim();
    if (!addonId) return;

    const addonAction = String(actionButton.dataset.addonAction || "").trim();
    const handler = clickActionHandlers[addonAction];
    if (!handler) return;

    await handler({ actionButton, addonId });
  });

  addListener("settings-addins-main-change", settingsMain, "change", async (event) => {
    const control = event.target?.closest?.(
      "[data-addon-action='toggle-addon-setting'][data-addon-id]",
    );
    if (!control) return;

    const addonId = String(control.dataset.addonId || "").trim();
    const path = String(control.dataset.addonSettingPath || "").trim();
    if (!addonId || !path) return;

    const addon = getAddonById(addonId);
    if (!addon) return;

    const readResult = await invokeAddonCoreAction(addonId, "storage.get", {
      key: addon.panelSettingsStorageKey || "settings",
      defaultValue: addon.panelSettingsDefaults || {},
    });
    if (!readResult?.ok) {
      showToast(`Failed to read add-on settings: ${readResult?.reason || "unknown"}`);
      if (control.type === "checkbox") {
        control.checked = !control.checked;
      } else if (control.type === "number") {
        control.value = String(getSettingByPath(addon.panelSettingsDefaults || {}, path) || "");
      }
      return;
    }

    const current =
      readResult.value && typeof readResult.value === "object"
        ? readResult.value
        : addon.panelSettingsDefaults || {};

    const newValue =
      control.type === "number"
        ? Number.isFinite(Number(control.value))
          ? Number(control.value)
          : null
        : Boolean(control.checked);

    const next = setSettingByPath(current, path, newValue);

    const writeResult = await invokeAddonCoreAction(addonId, "storage.set", {
      key: addon.panelSettingsStorageKey || "settings",
      value: next,
    });
    if (!writeResult?.ok) {
      showToast(`Failed to save add-on settings: ${writeResult?.reason || "unknown"}`);
      if (control.type === "checkbox") {
        control.checked = !control.checked;
      } else if (control.type === "number") {
        control.value = String(getSettingByPath(current, path) || "");
      }
      return;
    }

    const refreshResult = await invokeAddonCoreAction(addonId, "feature.refresh", {});
    if (!refreshResult?.ok) {
      showToast(`Setting saved but live apply failed: ${refreshResult?.reason || "unknown"}`);
    }
  });

  settingsMain.dataset.addinsActionsBound = "1";
}
