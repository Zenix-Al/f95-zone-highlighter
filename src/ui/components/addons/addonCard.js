import { createEl } from "../../../utils/dom.js";
import { isAddonsServiceDisabled } from "../../../services/addonsService.js";
import { createActionButton } from "./actionButton.js";
import { formatAddonScopes } from "./addonScopes.js";
import { createBadge } from "./badge.js";
import { ADDON_STATUS_META } from "./statusMeta.js";

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
      (addon.isTrusted ?? addon.trusted) ? "Trusted" : "Untrusted",
      (addon.isTrusted ?? addon.trusted) ? "installed" : "disabled",
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

  if (addon.isBlocked ?? addon.blocked) {
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

  createEl("div", {
    className: "addins-card-description",
    text: addon.description,
    mount: card,
  });

  createEl("div", {
    className: "addins-card-meta",
    text: formatAddonScopes(addon),
    mount: card,
  });

  const shouldShowCardStatusCopy =
    !planned &&
    Boolean(addon.statusMessage) &&
    !(addon.status === "installed" && addon.activeOnPage);

  if (shouldShowCardStatusCopy) {
    createEl("div", {
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
        (!addon.activeOnPage && addon.installedSeenAt > 0)) &&
      (addon.status !== "disabled" || addon.canEnable !== false);
    const supportsPinning = addon.status !== "not-installed";

    if (supportsFeatureToggle) {
      const isDisabled = addon.isEnabled === false;
      const toggleBtn = createActionButton(
        doc,
        isDisabled ? "Enable" : "Disable",
        "toggle-addon-feature",
        addon.id,
        isDisabled ? "addon-enable-btn" : "addon-disable-btn secondary",
      );
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
