import { createEl } from "../../../core/dom.js";
import { invokeAddonCoreAction, isAddonsServiceDisabled } from "../../../services/addonsService.js";
import { showToast } from "../toast.js";

const ADDON_STATUS_META = {
  installed: { label: "Installed", badgeClass: "installed" },
  disabled: { label: "Disabled", badgeClass: "disabled" },
  "not-installed": { label: "Not Installed", badgeClass: "disabled" },
  running: { label: "Running", badgeClass: "running" },
  failing: { label: "Failing", badgeClass: "error" },
};

export function createBadge(doc, text, className = "") {
  return createEl("span", {
    className: `addins-badge${className ? ` ${className}` : ""}`,
    text,
    mount: doc,
  });
}

export function formatAddonScopes(addon) {
  const scopes = Array.isArray(addon?.pageScopes) ? addon.pageScopes : [];
  if (scopes.length === 0) return "Runs on: (Missing scope data).";
  return `Runs on: ${scopes.join(", ")}.`;
}

export function createActionButton(doc, text, action, addonId, extraClass = "") {
  const button = createEl("button", {
    className: `addins-action-btn${extraClass ? ` ${extraClass}` : ""}`,
    text,
    attrs: {
      type: "button",
      "data-addon-action": action,
      "data-addon-id": addonId,
    },
    mount: doc,
  });
  return button;
}

export function createAddonPanelActions(doc, addon) {
  const actions = createEl("div", {
    className: "addins-panel-actions",
    mount: doc,
  });

  const backButton = createActionButton(doc, "Back to Add-ons", "back-to-addins", addon.id);
  actions.appendChild(backButton);

  const supportsFeatureToggle =
    addon.status !== "not-installed" &&
    (addon.capabilities?.includes("feature") || (!addon.activeOnPage && addon.installedSeenAt > 0));

  if (supportsFeatureToggle) {
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

export function createAddonCard(doc, addon, options = {}) {
  const { pinned = false, planned = false, pinnedIndex = -1, pinnedCount = 0 } = options;

  const card = createEl("article", {
    className: "addins-card",
    attrs: {
      "data-addon-id": addon.id,
    },
    mount: doc,
  });

  const head = createEl("div", {
    className: "addins-card-head",
    mount: card,
  });

  const info = createEl("div", {
    mount: card,
  });

  const name = createEl("div", {
    className: "addins-card-name",
    text: addon.name,
    mount: info,
  });

  const meta = createEl("div", {
    className: "addins-card-meta",
    text: planned ? "Roadmap candidate" : `Version ${addon.version}`,
    mount: info,
  });

  info.appendChild(name);
  info.appendChild(meta);

  const badges = createEl("div", {
    className: "addins-card-badges",
    mount: head,
  });

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

  if (isAddonsServiceDisabled()) {
    badges.appendChild(createBadge(doc, "Service Disabled", "error"));
  }

  if (pinned) {
    badges.appendChild(createBadge(doc, "Pinned", "pinned"));
  }

  head.appendChild(info);
  head.appendChild(badges);
  card.appendChild(head);

  const description = createEl("div", {
    className: "addins-card-description",
    text: addon.description,
    mount: card,
  });

  const scopeInfo = createEl("div", {
    className: "addins-card-meta",
    text: formatAddonScopes(addon),
    mount: card,
  });

  const shouldShowCardStatusCopy =
    !planned &&
    Boolean(addon.statusMessage) &&
    !(addon.status === "installed" && addon.activeOnPage);

  if (shouldShowCardStatusCopy) {
    const statusCopy = createEl("div", {
      className: `addins-status-copy ${addon.status}`,
      text: addon.statusMessage,
      mount: card,
    });
  }

  if (!planned) {
    const actions = createEl("div", {
      className: "addins-card-actions",
      mount: card,
    });

    const supportsFeatureToggle =
      addon.status !== "not-installed" &&
      (addon.capabilities?.includes("feature") ||
        (!addon.activeOnPage && addon.installedSeenAt > 0));
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
            return;
          }
          // Trigger UI update via custom event
          window.dispatchEvent(
            new CustomEvent("addon-card-toggle-updated", { detail: { addonId: addon.id } }),
          );
        } catch (err) {
          console.warn("Card toggle handler failed:", err);
        }
      });

      actions.appendChild(toggleBtn);
    }

    const openButton = createActionButton(doc, "Open", "open-addon-panel", addon.id);
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

      if (pinned) {
        actions.appendChild(
          createActionButton(doc, "Move Up", "move-addon-pin-up", addon.id, "secondary"),
        );
        actions.appendChild(
          createActionButton(doc, "Move Down", "move-addon-pin-down", addon.id, "secondary"),
        );
      }
    }

    if (addon.downloadUrl && addon.status === "not-installed") {
      actions.appendChild(
        createActionButton(doc, "Download", "open-addon-download", addon.id, "secondary"),
      );
    }

    if (addon.status !== "not-installed" && !addon.activeOnPage) {
      actions.appendChild(
        createActionButton(doc, "Delete Trace", "delete-addon-trace", addon.id, "secondary"),
      );
    }

    const moveUpButton = actions.querySelector('[data-addon-action="move-addon-pin-up"]');
    const moveDownButton = actions.querySelector('[data-addon-action="move-addon-pin-down"]');
    if (moveUpButton && moveDownButton) {
      const canMove = pinned && pinnedCount > 1;
      moveUpButton.disabled = !canMove || pinnedIndex <= 0;
      moveDownButton.disabled = !canMove || pinnedIndex < 0 || pinnedIndex >= pinnedCount - 1;
    }
  }

  return card;
}

export async function renderAddonPanelSettings(container, addon) {
  if (!container || !addon) return;

  // If addon is not active on this page, show where it can be accessed
  if (!addon.activeOnPage) {
    container.hidden = false;
    container.innerHTML = "";

    const messageDiv = createEl("div", {
      className: "addins-status-copy disabled",
      mount: container,
    });

    const scopeInfo = formatAddonScopes(addon);
    messageDiv.textContent = `Add-on is idle on this page. Please go to the page where the add-on is active to configure it. ${scopeInfo}`;
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

  const title = createEl("div", {
    className: "feature-health-title",
    text: addon.panelSettingsTitle || "Add-on Settings",
    mount: container,
  });

  const desc = createEl("div", {
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
    const error = createEl("div", {
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
    const settingType = String(entry?.type || "toggle")
      .trim()
      .toLowerCase();
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
      const tip = createEl("span", {
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

export function getSettingByPath(obj, path) {
  if (!obj || typeof obj !== "object" || !path) return undefined;
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
}

export { ADDON_STATUS_META };
