import { createEl } from "../../../utils/dom.js";

export const ADDON_DOCK_SLOT_ID = "f95ue-page-dock-addon-slot";
export const ADDON_DIALOG_HOST_ID = "f95ue-addon-dialog-host";
export const ADDON_PANEL_HOST_ID = "f95ue-addon-panel-host";
export const ADDON_FLOATING_HOST_ID = "f95ue-addon-floating-host";

export function getAddonDockSlotElement(shadowRoot) {
  if (!shadowRoot?.getElementById) return null;
  return shadowRoot.getElementById(ADDON_DOCK_SLOT_ID);
}

export function ensureAddonDialogHost() {
  let host = document.getElementById(ADDON_DIALOG_HOST_ID);
  if (host) return host;

  host = createEl("div", {
    attrs: {
      id: ADDON_DIALOG_HOST_ID,
    },
    style: {
      position: "fixed",
      inset: "0",
      zIndex: "12040",
      pointerEvents: "none",
    },
  });
  document.body.appendChild(host);
  return host;
}

export function ensureAddonPanelHost() {
  let host = document.getElementById(ADDON_PANEL_HOST_ID);
  if (host) return host;

  host = createEl("div", {
    attrs: {
      id: ADDON_PANEL_HOST_ID,
      "data-addon-slot": "page.panel",
    },
    mount: document.body,
  });
  return host;
}

export function ensureAddonFloatingHost() {
  let host = document.getElementById(ADDON_FLOATING_HOST_ID);
  if (host) return host;

  host = createEl("div", {
    attrs: {
      id: ADDON_FLOATING_HOST_ID,
      "data-addon-slot": "page.floating",
    },
    style: {
      position: "fixed",
      inset: "0",
      zIndex: "9000",
      pointerEvents: "auto",
    },
    mount: document.body,
  });
  return host;
}

export function resolveAddonMountHost(slot, { shadowRoot } = {}) {
  const normalizedSlot = String(slot || "")
    .trim()
    .toLowerCase();

  if (!normalizedSlot || normalizedSlot === "body") return document.body;
  if (normalizedSlot === "latest.filters.after-title") {
    return document.querySelector(".content-block_filter-title");
  }
  if (normalizedSlot === "page.dock") return getAddonDockSlotElement(shadowRoot);
  if (normalizedSlot === "page.panel") return ensureAddonPanelHost();
  if (normalizedSlot === "page.floating") return ensureAddonFloatingHost();
  if (normalizedSlot.startsWith("selector:")) {
    const selector = String(slot || "")
      .slice("selector:".length)
      .trim();
    if (!selector) return null;
    try {
      return document.querySelector(selector);
    } catch {
      return null;
    }
  }

  return null;
}
