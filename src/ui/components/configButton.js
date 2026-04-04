import stateManager, { config } from "../../config.js";
import { openModal } from "./modal.js";

const PAGE_DOCK_ID = "f95ue-page-dock";
const PAGE_DOCK_MAIN_SLOT_ID = "f95ue-page-dock-main-slot";
const PAGE_DOCK_ADDON_SLOT_ID = "f95ue-page-dock-addon-slot";
const PAGE_DOCK_COLLAPSE_DELAY_MS = 2400;

let dockCollapseTimer = 0;

function clearDockCollapseTimer() {
  if (!dockCollapseTimer) return;
  window.clearTimeout(dockCollapseTimer);
  dockCollapseTimer = 0;
}

function expandDock(dock) {
  clearDockCollapseTimer();
  dock?.classList.remove("is-collapsed");
}

function scheduleDockCollapse(dock) {
  clearDockCollapseTimer();
  if (!dock || dock.dataset.hideMode !== "auto") {
    dock?.classList.remove("is-collapsed");
    return;
  }

  dockCollapseTimer = window.setTimeout(() => {
    dock.classList.add("is-collapsed");
  }, PAGE_DOCK_COLLAPSE_DELAY_MS);
}

function bindDockAutoHide(dock) {
  if (!dock || dock.dataset.bound === "1") return;

  dock.addEventListener("focusin", () => expandDock(dock));
  dock.addEventListener("focusout", () => {
    window.setTimeout(() => {
      if (!dock.matches(":focus-within")) {
        scheduleDockCollapse(dock);
      }
    }, 0);
  });

  dock.dataset.bound = "1";
}

function ensureDock() {
  const shadowRoot = stateManager.get("shadowRoot");
  if (!shadowRoot) return null;

  let dock = shadowRoot.getElementById(PAGE_DOCK_ID);
  if (dock) return dock;

  dock = document.createElement("div");
  dock.id = PAGE_DOCK_ID;

  const mainSlot = document.createElement("div");
  mainSlot.id = PAGE_DOCK_MAIN_SLOT_ID;

  const addonSlot = document.createElement("div");
  addonSlot.id = PAGE_DOCK_ADDON_SLOT_ID;

  dock.appendChild(mainSlot);
  dock.appendChild(addonSlot);
  shadowRoot.appendChild(dock);

  bindDockAutoHide(dock);
  return dock;
}

export function ensureAddonDockSlot() {
  const dock = ensureDock();
  return dock?.querySelector(`#${PAGE_DOCK_ADDON_SLOT_ID}`) || null;
}

export function injectButton() {
  const shadowRoot = stateManager.get("shadowRoot");
  if (!shadowRoot || shadowRoot.getElementById("tag-config-button")) return;

  const dock = ensureDock();
  const mainSlot = dock?.querySelector(`#${PAGE_DOCK_MAIN_SLOT_ID}`);
  if (!mainSlot) return;

  const button = document.createElement("button");
  button.textContent = "⚙";
  button.id = "tag-config-button";
  button.className = "f95ue-page-dock-btn";
  button.addEventListener("click", () => openModal());
  mainSlot.appendChild(button);
}

export function updateButtonVisibility() {
  const shadowRoot = stateManager.get("shadowRoot");
  const button = shadowRoot?.getElementById("tag-config-button");
  const dock = ensureDock();
  if (!button || !dock) return;

  if (config.globalSettings.configVisibility === false) {
    dock.dataset.hideMode = "auto";
    scheduleDockCollapse(dock);
  } else {
    dock.dataset.hideMode = "manual";
    clearDockCollapseTimer();
    dock.classList.remove("is-collapsed");
  }
}
