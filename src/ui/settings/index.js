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
import { colorSettingsMeta } from "./colorSettings";
import { globalSettingsMeta } from "./globalSettings";
import { latestSettingsMeta } from "./latestSettings";
import { threadSettingsMeta } from "./threadSettings";
import { ADDON_COMMAND_EVENT } from "../../services/addons/shared.js";
import {
  invokeAddonCoreAction,
  listKnownAddons,
  subscribeAddonsRegistry,
} from "../../services/addonsService.js";
import { showAllTags, updateSearch, updateTags } from "../../services/tagsService";
import { checkTags } from "../../services/safetyService";

const DEFAULT_SETTINGS_PANEL = "settings-panel-general";
const SETTINGS_ACTIVE_PANEL_STORAGE_KEY = "settingsUiActivePanel";
const SETTINGS_PINNED_ADDONS_STORAGE_KEY = "settingsUiPinnedAddonIds";
let addonsRegistryUnsubscribe = null;

const ADDON_STATUS_META = {
  installed: { label: "Installed", badgeClass: "installed" },
  disabled: { label: "Disabled", badgeClass: "disabled" },
  "needs-update": { label: "Needs Update", badgeClass: "needs-update" },
  error: { label: "Error", badgeClass: "error" },
  broken: { label: "Broken", badgeClass: "broken" },
  "not-installed": { label: "Not Installed", badgeClass: "disabled" },
};

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
    supportsCurrentPage: addon.supportsCurrentPage !== false,
    pageScopes: Array.isArray(addon.pageScopes) ? [...addon.pageScopes] : [],
    downloadUrl: String(addon.downloadUrl || "").trim(),
    panelId: buildAddonPanelId(id),
  };
}

function getSettingByPath(source, path) {
  if (!source || typeof source !== "object") return undefined;
  const parts = String(path || "")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
  let cursor = source;
  for (const part of parts) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = cursor[part];
  }
  return cursor;
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

async function renderAddonPanelSettings(container, addon) {
  if (!container || !addon) return;
  const settings = Array.isArray(addon.panelSettings) ? addon.panelSettings : [];
  if (settings.length === 0) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }

  container.hidden = false;
  container.innerHTML = "";

  const title = document.createElement("div");
  title.className = "feature-health-title";
  title.textContent = addon.panelSettingsTitle || "Add-on Settings";
  container.appendChild(title);

  const desc = document.createElement("div");
  desc.className = "tag-priority-note";
  desc.textContent =
    addon.panelSettingsDescription || "Configure this add-on behavior for your current profile.";
  container.appendChild(desc);

  const valueResult = await invokeAddonCoreAction(addon.id, "storage.get", {
    key: addon.panelSettingsStorageKey || "settings",
    defaultValue: addon.panelSettingsDefaults || {},
  });

  if (!valueResult?.ok) {
    const error = document.createElement("div");
    error.className = "addins-status-copy error";
    error.textContent = `Settings unavailable: ${valueResult?.reason || "unknown_error"}`;
    container.appendChild(error);
    return;
  }

  const current =
    valueResult.value && typeof valueResult.value === "object"
      ? valueResult.value
      : addon.panelSettingsDefaults || {};

  settings.forEach((entry) => {
    const path = String(entry?.path || "").trim();
    const label = String(entry?.text || "").trim();
    if (!path || !label) return;

    const row = document.createElement("div");
    row.className = "config-row addins-setting-row";

    const labelEl = document.createElement("label");
    labelEl.textContent = label;
    const tooltip = String(entry?.tooltip || "").trim();
    if (tooltip) {
      const tip = document.createElement("span");
      tip.className = "setting-tooltip-badge";
      tip.title = tooltip;
      tip.textContent = "?";
      labelEl.appendChild(tip);
    }

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = getSettingByPath(current, path) !== false;
    toggle.dataset.addonAction = "toggle-addon-setting";
    toggle.dataset.addonId = addon.id;
    toggle.dataset.addonSettingPath = path;

    row.appendChild(labelEl);
    row.appendChild(toggle);
    container.appendChild(row);
  });
}

function getRegisteredAddons() {
  return listKnownAddons().map(normalizeAddonEntry).filter(Boolean);
}

function getAddonById(addonId) {
  return getRegisteredAddons().find((addon) => addon.id === addonId) || null;
}

function getAddonByPanelId(panelId) {
  return getRegisteredAddons().find((addon) => addon.panelId === panelId) || null;
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

function createBadge(doc, text, className = "") {
  const badge = doc.createElement("span");
  badge.className = `addins-badge${className ? ` ${className}` : ""}`;
  badge.textContent = text;
  return badge;
}

function createActionButton(doc, text, action, addonId, extraClass = "") {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = `addins-action-btn${extraClass ? ` ${extraClass}` : ""}`;
  button.dataset.addonAction = action;
  button.dataset.addonId = addonId;
  button.textContent = text;
  return button;
}

function createAddonPanelActions(doc, addon) {
  const actions = doc.createElement("div");
  actions.className = "addins-panel-actions";

  const backButton = createActionButton(doc, "Back to Add-ons", "back-to-addins", addon.id);
  actions.appendChild(backButton);

  if (addon.capabilities?.includes("feature") && addon.status !== "not-installed") {
    const isDisabled = addon.status === "disabled";
    const toggleButton = createActionButton(
      doc,
      isDisabled ? "Enable" : "Disable",
      "toggle-addon-feature",
      addon.id,
      isDisabled ? "addon-enable-btn" : "addon-disable-btn secondary",
    );
    actions.appendChild(toggleButton);
  }

  if (addon.panelToastLabel && addon.panelToastMessage) {
    const toastButton = createActionButton(
      doc,
      addon.panelToastLabel,
      "trigger-addon-toast",
      addon.id,
      "secondary",
    );
    toastButton.dataset.toastMessage = addon.panelToastMessage;
    actions.appendChild(toastButton);
  }

  const panelActions = Array.isArray(addon.panelActions) ? addon.panelActions : [];
  panelActions.forEach((entry) => {
    const actionId = String(entry?.id || "").trim();
    const label = String(entry?.label || "").trim();
    if (!actionId || !label) return;

    const button = createActionButton(
      doc,
      label,
      "trigger-addon-command",
      addon.id,
      entry.variant === "secondary" ? "secondary" : "",
    );
    button.dataset.addonCommandId = actionId;
    button.dataset.requiresActivePage = entry.requiresActivePage === false ? "0" : "1";
    if (button.dataset.requiresActivePage === "1" && !addon.activeOnPage) {
      button.disabled = true;
    }
    actions.appendChild(button);
  });

  return actions;
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

function createAddonCard(doc, addon, options = {}) {
  const { pinned = false, planned = false, pinnedIndex = -1, pinnedCount = 0 } = options;
  const card = doc.createElement("article");
  card.className = "addins-card";
  card.dataset.addonId = addon.id;

  const head = doc.createElement("div");
  head.className = "addins-card-head";

  const info = doc.createElement("div");
  const name = doc.createElement("div");
  name.className = "addins-card-name";
  name.textContent = addon.name;

  const meta = doc.createElement("div");
  meta.className = "addins-card-meta";
  meta.textContent = planned ? "Roadmap candidate" : `Version ${addon.version}`;

  info.appendChild(name);
  info.appendChild(meta);

  const badges = doc.createElement("div");
  badges.className = "addins-card-badges";
  const statusMeta = planned
    ? { label: "Planned", badgeClass: "planned" }
    : ADDON_STATUS_META[addon.status] || ADDON_STATUS_META.installed;
  badges.appendChild(createBadge(doc, statusMeta.label, statusMeta.badgeClass));
  badges.appendChild(
    createBadge(
      doc,
      addon.trusted ? "Trusted" : "Untrusted",
      addon.trusted ? "installed" : "disabled",
    ),
  );
  if (addon.status !== "not-installed") {
    badges.appendChild(
      createBadge(
        doc,
        addon.activeOnPage ? "Active Here" : "Idle Here",
        addon.activeOnPage ? "running" : "disabled",
      ),
    );
  }
  if (addon.blocked) {
    badges.appendChild(createBadge(doc, "Blocked", "error"));
  }
  if (pinned) {
    badges.appendChild(createBadge(doc, "Pinned", "pinned"));
  }

  head.appendChild(info);
  head.appendChild(badges);

  const description = doc.createElement("div");
  description.className = "addins-card-description";
  description.textContent = addon.description;

  card.appendChild(head);
  card.appendChild(description);

  if (!planned && addon.statusMessage) {
    const statusCopy = doc.createElement("div");
    statusCopy.className = `addins-status-copy ${addon.status}`;
    statusCopy.textContent = addon.statusMessage;
    card.appendChild(statusCopy);
  }

  if (!planned) {
    const actions = doc.createElement("div");
    actions.className = "addins-card-actions";
    const supportsFeatureToggle =
      addon.capabilities?.includes("feature") && addon.status !== "not-installed";
    const supportsPinning = addon.status !== "not-installed";

    if (supportsFeatureToggle) {
      const isDisabled = addon.status === "disabled";
      const toggleBtn = createActionButton(
        doc,
        isDisabled ? "Enable" : "Disable",
        "toggle-addon-feature",
        addon.id,
        isDisabled ? "addon-enable-btn" : "addon-disable-btn secondary",
      );
      // Robustness: attach direct click handler to card-level toggle so clicks
      // work even if delegated listeners are not reachable in some scopes.
      toggleBtn.addEventListener("click", async (ev) => {
        try {
          ev.stopPropagation();
          if (!addon || addon.status === "not-installed") {
            showToast("Add-on action failed: addon_not_registered");
            return;
          }
          const action = addon.status === "disabled" ? "feature.enable" : "feature.disable";
          const result = await invokeAddonCoreAction(addon.id, action, {});
          if (!result?.ok) {
            showToast(`Add-on action failed: ${result?.reason || "unknown"}`);
          }
        } catch (err) {
          console.warn("Card toggle handler failed:", err);
        }
      });
      actions.appendChild(toggleBtn);
    }

    const openButton = createActionButton(doc, "Open", "open-addon-panel", addon.id);
    openButton.disabled = !addon.activeOnPage;
    actions.appendChild(openButton);
    if (supportsPinning) {
      actions.appendChild(
        createActionButton(
          doc,
          pinned ? "Unpin Shortcut" : "Pin to Sidebar",
          "toggle-addon-pin",
          addon.id,
          "secondary",
        ),
      );
      actions.appendChild(
        createActionButton(doc, "Move Up", "move-addon-pin-up", addon.id, "secondary"),
      );
      actions.appendChild(
        createActionButton(doc, "Move Down", "move-addon-pin-down", addon.id, "secondary"),
      );
    }

    if (addon.downloadUrl && addon.status === "not-installed") {
      actions.appendChild(
        createActionButton(doc, "Download", "open-addon-download", addon.id, "secondary"),
      );
    }

    const moveUpButton = actions.querySelector('[data-addon-action="move-addon-pin-up"]');
    const moveDownButton = actions.querySelector('[data-addon-action="move-addon-pin-down"]');
    if (moveUpButton && moveDownButton) {
      const canMove = pinned && pinnedCount > 1;
      moveUpButton.disabled = !canMove || pinnedIndex <= 0;
      moveDownButton.disabled = !canMove || pinnedIndex < 0 || pinnedIndex >= pinnedCount - 1;
    }

    card.appendChild(actions);
  }

  return card;
}

function syncAddonPanels(shadowRoot) {
  const settingsMain = shadowRoot.querySelector(".settings-main");
  if (!settingsMain) return;

  settingsMain
    .querySelectorAll(".settings-panel[data-addon-panel='true']")
    .forEach((panel) => panel.remove());

  getRegisteredAddons()
    .filter((addon) => addon.status !== "not-installed")
    .forEach((addon) => {
      const panel = document.createElement("div");
      panel.id = addon.panelId;
      panel.className = "settings-panel";
      panel.dataset.addonPanel = "true";
      panel.dataset.addonId = addon.id;

      const wrapper = document.createElement("div");
      wrapper.className = "settings-wrapper-inner";

      const header = document.createElement("div");
      header.className = "config-header";
      header.textContent = addon.panelTitle || addon.name;

      const note = document.createElement("div");
      note.className = "tag-priority-note";
      const scopeText =
        addon.pageScopes.length > 0 ? ` Runs on: ${addon.pageScopes.join(", ")}.` : "";
      note.textContent =
        addon.panelBody || `${addon.name} is connected to the new add-ons shell.${scopeText}`;

      if (addon.statusMessage) {
        note.classList.add("settings-addon-status-note", addon.status);
      }

      const statusMeta = ADDON_STATUS_META[addon.status] || ADDON_STATUS_META.installed;
      const statusRow = document.createElement("div");
      statusRow.className = "addins-panel-status-row";
      statusRow.appendChild(createBadge(document, statusMeta.label, statusMeta.badgeClass));
      statusRow.appendChild(
        createBadge(
          document,
          addon.trusted ? "Trusted" : "Untrusted",
          addon.trusted ? "installed" : "disabled",
        ),
      );
      if (addon.status !== "not-installed") {
        statusRow.appendChild(
          createBadge(
            document,
            addon.activeOnPage ? "Active Here" : "Idle Here",
            addon.activeOnPage ? "running" : "disabled",
          ),
        );
      }
      if (addon.blocked) {
        statusRow.appendChild(createBadge(document, "Blocked", "error"));
      }
      if (
        addon.capabilities?.includes("feature") &&
        (addon.status === "installed" || addon.status === "disabled")
      ) {
        const runningBadgeLabel = addon.status === "disabled" ? "Paused" : "Running";
        const runningBadgeClass = addon.status === "disabled" ? "disabled" : "running";
        statusRow.appendChild(createBadge(document, runningBadgeLabel, runningBadgeClass));
      }
      if (getPinnedAddonIds().includes(addon.id)) {
        statusRow.appendChild(createBadge(document, "Pinned", "pinned"));
      }

      const actions = createAddonPanelActions(document, addon);

      const statusMessageEl = document.createElement("div");
      statusMessageEl.className = `addins-status-copy ${addon.status}`;
      statusMessageEl.textContent =
        addon.statusMessage ||
        (addon.status === "disabled" ? "This add-on is currently disabled." : "Add-on is active.");
      statusMessageEl.hidden = !addon.capabilities?.includes("feature") && !addon.statusMessage;

      wrapper.appendChild(header);
      wrapper.appendChild(note);
      wrapper.appendChild(statusRow);
      wrapper.appendChild(statusMessageEl);

      const settingsContainer = document.createElement("div");
      settingsContainer.className = "addins-panel-settings";
      settingsContainer.dataset.addonId = addon.id;
      wrapper.appendChild(settingsContainer);
      void renderAddonPanelSettings(settingsContainer, addon);

      wrapper.appendChild(actions);
      panel.appendChild(wrapper);
      settingsMain.appendChild(panel);
    });
}

function renderAddinsOverview(shadowRoot) {
  const installedList = shadowRoot.getElementById("addins-installed-list");
  if (!installedList) return;

  installedList.innerHTML = "";

  const registeredAddons = getRegisteredAddons();
  const pinnedIds = getPinnedAddonIds();

  if (registeredAddons.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "addins-empty-state";

    const title = document.createElement("div");
    title.className = "addins-empty-title";
    title.textContent = "No trusted add-ons listed";

    const copy = document.createElement("div");
    copy.className = "addins-empty-copy";
    copy.textContent = "Trusted add-ons will appear here with install links and runtime status.";

    emptyState.appendChild(title);
    emptyState.appendChild(copy);
    installedList.appendChild(emptyState);
  } else {
    registeredAddons.forEach((addon) => {
      const pinnedIndex = pinnedIds.indexOf(addon.id);
      installedList.appendChild(
        createAddonCard(document, addon, {
          pinned: pinnedIndex >= 0,
          pinnedIndex,
          pinnedCount: pinnedIds.length,
        }),
      );
    });
  }
}

function syncPinnedAddonNav(shadowRoot) {
  const pinnedGroup = shadowRoot.getElementById("settings-nav-pinned-group");
  const pinnedItems = shadowRoot.getElementById("settings-nav-pinned-items");
  if (!pinnedGroup || !pinnedItems) return;

  pinnedItems.innerHTML = "";
  const addonById = new Map(getRegisteredAddons().map((addon) => [addon.id, addon]));
  const pinnedAddons = getPinnedAddonIds()
    .map((id) => addonById.get(id))
    .filter((addon) => addon && addon.status !== "not-installed");

  pinnedGroup.hidden = pinnedAddons.length === 0;
  pinnedAddons.forEach((addon) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "settings-nav-item settings-nav-addon-item";
    button.dataset.target = addon.panelId;
    button.dataset.addonId = addon.id;
    button.textContent = addon.name;
    pinnedItems.appendChild(button);
  });
}

function setActivePanel(shadowRoot, targetId, { persist = true } = {}) {
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
    if (isActive) panel.scrollTop = 0;
  });

  stateManager.set("settingsActivePanel", nextPanelId);
  if (persist) {
    void persistSettingsUiValue(SETTINGS_ACTIVE_PANEL_STORAGE_KEY, nextPanelId);
  }
}

function syncSettingsSidebarNavigation(shadowRoot) {
  syncAddonPanels(shadowRoot);
  syncPinnedAddonNav(shadowRoot);
  renderAddinsOverview(shadowRoot);
  setActivePanel(shadowRoot, stateManager.get("settingsActivePanel"), { persist: false });
}

function initSettingsSidebarNavigation(shadowRoot) {
  const nav = shadowRoot.getElementById("settings-nav");
  if (!nav || nav.dataset.initBound) return;

  nav.addEventListener("click", (event) => {
    const target = event.target?.closest?.(".settings-nav-item[data-target]");
    if (!target) return;
    const targetPanelId = String(target.dataset.target || "").trim();
    const addon = getAddonByPanelId(targetPanelId);
    if (addon && !addon.activeOnPage) {
      showToast("This add-on is idle on this page.");
      setActivePanel(shadowRoot, "settings-panel-addins");
      return;
    }
    setActivePanel(shadowRoot, targetPanelId);
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
      if (!addon?.activeOnPage) {
        showToast("This add-on is idle on this page.");
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
      }
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
      }
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
