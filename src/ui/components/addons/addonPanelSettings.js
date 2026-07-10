import { createEl } from "../../../utils/dom.js";
import { invokeAddonCoreAction } from "../../../services/addonsService.js";
import { formatAddonScopes } from "./addonScopes.js";
import { getSettingByPath } from "./settingPath.js";

function getInactiveSettingsMessage(addon) {
  const scopeInfo = formatAddonScopes(addon);

  if (addon.status === "disabled") {
    return `Add-on is disabled. Enable it on a supported page to configure it. ${scopeInfo}`.trim();
  }

  if (addon.supportsCurrentPage) {
    return "";
  }

  return `Add-on is idle on this page. Please go to the page where the add-on is active to configure it. ${scopeInfo}`.trim();
}

export async function renderAddonPanelSettings(container, addon) {
  if (!container || !addon) return;

  if (!addon.activeOnPage) {
    container.innerHTML = "";
    const inactiveMessage = getInactiveSettingsMessage(addon);
    if (!inactiveMessage) {
      container.hidden = true;
      return;
    }

    container.hidden = false;

    const messageDiv = createEl("div", {
      className: "addins-status-copy disabled",
      mount: container,
    });

    messageDiv.textContent = inactiveMessage;
    return;
  }

  const settings = Array.isArray(addon.panelSettings) ? addon.panelSettings : [];
  if (settings.length === 0) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }

  container.hidden = false;
  container.innerHTML = "";

  createEl("div", {
    className: "feature-health-title",
    text: addon.panelSettingsTitle || "Add-on Settings",
    mount: container,
  });

  createEl("div", {
    className: "tag-priority-note",
    text:
      addon.panelSettingsDescription || "Configure this add-on behavior for your current profile.",
    mount: container,
  });

  const valueResult = await invokeAddonCoreAction(addon.id, "storage.get", {
    key: addon.panelSettingsStorageKey || "settings",
    defaultValue: addon.panelSettingsDefaults || {},
  });

  if (!valueResult?.ok) {
    createEl("div", {
      className: "addins-status-copy error",
      text: `Settings unavailable: ${valueResult?.reason || "unknown_error"}`,
      mount: container,
    });
    return;
  }

  const current =
    valueResult.value && typeof valueResult.value === "object"
      ? valueResult.value
      : addon.panelSettingsDefaults || {};

  settings.forEach((entry) => {
    const path = String(entry?.path || "").trim();
    const label = String(entry?.text || "").trim();
    const settingType = String(entry?.type || "toggle").trim().toLowerCase();
    if (!path || !label) return;

    const row = createEl("div", {
      className: "config-row addins-setting-row",
      mount: container,
    });

    const labelEl = createEl("label", {
      text: label,
      mount: row,
    });

    const tooltip = String(entry?.tooltip || "").trim();
    if (tooltip) {
      createEl("span", {
        className: "setting-tooltip-badge",
        text: "?",
        attrs: {
          title: tooltip,
        },
        mount: labelEl,
      });
    }

    if (settingType === "number") {
      const attrs = {
        type: "number",
        "data-addon-action": "toggle-addon-setting",
        "data-addon-id": addon.id,
        "data-addon-setting-path": path,
      };
      if (Number.isFinite(entry?.min)) attrs.min = String(entry.min);
      if (Number.isFinite(entry?.max)) attrs.max = String(entry.max);
      if (Number.isFinite(entry?.step)) attrs.step = String(entry.step);

      const input = createEl("input", {
        attrs,
        mount: row,
      });
      let currentValue = getSettingByPath(current, path);
      if (!Number.isFinite(currentValue)) {
        currentValue = getSettingByPath(addon.panelSettingsDefaults, path);
      }
      if (Number.isFinite(currentValue)) {
        input.value = String(currentValue);
      }
    } else {
      const toggle = createEl("input", {
        attrs: {
          type: "checkbox",
          "data-addon-action": "toggle-addon-setting",
          "data-addon-id": addon.id,
          "data-addon-setting-path": path,
        },
        mount: row,
      });
      toggle.checked = getSettingByPath(current, path) !== false;
    }
  });
}
