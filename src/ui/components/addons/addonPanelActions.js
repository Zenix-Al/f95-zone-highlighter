import { createEl } from "../../../core/dom.js";
import { createActionButton } from "./actionButton.js";

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
