import { createEl } from "../../../core/dom.js";
import {
  createAddonCard,
  createAddonPanelActions,
  createBadge,
  formatAddonScopes,
  renderAddonPanelSettings,
  ADDON_STATUS_META,
} from "./renderer.js";
import { isAddonsServiceDisabled } from "../../../services/addonsService.js";

/**
 * Syncs addon detail panels in the settings main area.
 * Creates or updates panel views for each installed addon.
 */
export function syncAddonPanels(shadowRoot, getRegisteredAddons, getPinnedAddonIds) {
  const settingsMain = shadowRoot.querySelector(".settings-main");
  if (!settingsMain) return;

  settingsMain
    .querySelectorAll(".settings-panel[data-addon-panel='true']")
    .forEach((panel) => panel.remove());

  const doc = shadowRoot.ownerDocument || shadowRoot.host?.ownerDocument || document;

  getRegisteredAddons()
    .filter((addon) => addon.status !== "not-installed")
    .forEach((addon) => {
      const panel = createEl("div", {
        className: "settings-panel",
        attrs: {
          id: addon.panelId,
          "data-addon-panel": "true",
          "data-addon-id": addon.id,
        },
        mount: settingsMain,
      });

      const wrapper = createEl("div", {
        className: "settings-wrapper-inner",
        mount: panel,
      });

      createEl("div", {
        className: "config-header",
        text: addon.panelTitle || addon.name,
        mount: wrapper,
      });

      const note = createEl("div", {
        className: "tag-priority-note",
        mount: wrapper,
      });

      const scopeText = formatAddonScopes(addon);
      const panelText = addon.panelBody || `${addon.name} is connected to the new add-ons shell.`;
      note.textContent = `${panelText} ${scopeText}`.trim();

      if (addon.statusMessage) {
        note.classList.add("settings-addon-status-note", addon.status);
      }

      const statusMeta = ADDON_STATUS_META[addon.status] || ADDON_STATUS_META.installed;
      const statusRow = createEl("div", {
        className: "addins-panel-status-row",
        mount: wrapper,
      });

      statusRow.appendChild(createBadge(doc, statusMeta.label, statusMeta.badgeClass));
      statusRow.appendChild(
        createBadge(
          doc,
          addon.trusted ? "Trusted" : "Untrusted",
          addon.trusted ? "installed" : "disabled",
        ),
      );

      if (addon.status !== "not-installed") {
        statusRow.appendChild(
          createBadge(
            doc,
            addon.activeOnPage ? "Active Here" : "Idle Here",
            addon.activeOnPage ? "running" : "disabled",
          ),
        );
      }

      if (addon.blocked) {
        statusRow.appendChild(createBadge(doc, "Blocked", "error"));
      }

      if (
        addon.capabilities?.includes("feature") &&
        (addon.status === "installed" || addon.status === "disabled")
      ) {
        const runningBadgeLabel = addon.status === "disabled" ? "Paused" : "Running";
        const runningBadgeClass = addon.status === "disabled" ? "disabled" : "running";
        statusRow.appendChild(createBadge(doc, runningBadgeLabel, runningBadgeClass));
      }

      if (getPinnedAddonIds().includes(addon.id)) {
        statusRow.appendChild(createBadge(doc, "Pinned", "pinned"));
      }

      const actions = createAddonPanelActions(doc, addon);
      wrapper.appendChild(actions);

      const statusMessageEl = createEl("div", {
        className: `addins-status-copy ${addon.status}`,
        text:
          addon.statusMessage ||
          (addon.status === "disabled"
            ? "This add-on is currently disabled."
            : "Add-on is active."),
        attrs: {
          hidden: !addon.capabilities?.includes("feature") && !addon.statusMessage ? "" : undefined,
        },
        mount: wrapper,
      });

      const settingsContainer = createEl("div", {
        className: "addins-panel-settings",
        attrs: {
          "data-addon-id": addon.id,
        },
        mount: wrapper,
      });

      void renderAddonPanelSettings(settingsContainer, addon);
    });
}

/**
 * Renders the addon list overview with cards.
 * Displays all trusted addons and shows service disabled state if applicable.
 */
export function renderAddinsOverview(shadowRoot, getRegisteredAddons, getPinnedAddonIds) {
  const installedList = shadowRoot.getElementById("addins-installed-list");
  if (!installedList) return;

  installedList.innerHTML = "";
  const doc = shadowRoot.ownerDocument || shadowRoot.host?.ownerDocument || document;

  const registeredAddons = getRegisteredAddons();
  const pinnedIds = getPinnedAddonIds();
  const addinsCatalogNote = shadowRoot.getElementById("addins-catalog-note");
  const hasCatalogFallback = registeredAddons.some((addon) => addon.catalogFresh === false);

  if (isAddonsServiceDisabled()) {
    const disabledBanner = createEl("div", {
      className: "settings-addon-status-note error",
      text: "⚠️ Add-ons service is disabled. No add-ons will be loaded or executed.",
      mount: installedList,
    });
  }

  if (addinsCatalogNote) {
    addinsCatalogNote.textContent = hasCatalogFallback
      ? "Failed to fetch catalog. Showing fallback metadata with minimum information."
      : "Trusted add-ons are listed here with install links and page-aware runtime status.";
    addinsCatalogNote.classList.toggle("settings-addon-status-note", hasCatalogFallback);
    addinsCatalogNote.classList.toggle("error", hasCatalogFallback);
  }

  if (registeredAddons.length === 0) {
    const emptyState = createEl("div", {
      className: "addins-empty-state",
      mount: installedList,
    });

    createEl("div", {
      className: "addins-empty-title",
      text: "No trusted add-ons listed",
      mount: emptyState,
    });

    createEl("div", {
      className: "addins-empty-copy",
      text: isAddonsServiceDisabled()
        ? "Add-ons service is disabled. Enable it in global settings to load add-ons."
        : "Trusted add-ons will appear here with install links and runtime status.",
      mount: emptyState,
    });
  } else {
    registeredAddons.forEach((addon) => {
      const pinnedIndex = pinnedIds.indexOf(addon.id);
      installedList.appendChild(
        createAddonCard(doc, addon, {
          pinned: pinnedIndex >= 0,
          pinnedIndex,
          pinnedCount: pinnedIds.length,
        }),
      );
    });
  }
}

/**
 * Syncs pinned addons in the sidebar navigation.
 * Updates the pinned addons list in the sidebar navigation panel.
 */
export function syncPinnedAddonNav(shadowRoot, getRegisteredAddons, getPinnedAddonIds) {
  const pinnedGroup = shadowRoot.getElementById("settings-nav-pinned-group");
  const pinnedItems = shadowRoot.getElementById("settings-nav-pinned-items");
  if (!pinnedGroup || !pinnedItems) return;

  const doc = shadowRoot.ownerDocument || shadowRoot.host?.ownerDocument || document;

  pinnedItems.innerHTML = "";
  const addonById = new Map(getRegisteredAddons().map((addon) => [addon.id, addon]));
  const pinnedAddons = getPinnedAddonIds()
    .map((id) => addonById.get(id))
    .filter((addon) => addon && addon.status !== "not-installed");

  pinnedGroup.hidden = pinnedAddons.length === 0;
  pinnedAddons.forEach((addon) => {
    createEl("button", {
      className: "settings-nav-item settings-nav-addon-item",
      text: addon.name,
      attrs: {
        type: "button",
        "data-target": addon.panelId,
        "data-addon-id": addon.id,
      },
      mount: pinnedItems,
    });
  });
}
