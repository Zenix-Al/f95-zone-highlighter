import stateManager from "../../config.js";
import { ADDON_COMMAND_EVENT } from "./shared.js";

const ADDON_DOCK_SLOT_ID = "f95ue-page-dock-addon-slot";
const ADDON_DIALOG_HOST_ID = "f95ue-addon-dialog-host";
const ADDON_PANEL_HOST_ID = "f95ue-addon-panel-host";
const ADDON_FLOATING_HOST_ID = "f95ue-addon-floating-host";

const addonDockButtonsState = new Map();
const addonStyleRegistry = new Map();
const addonMountRegistry = new Map();
const addonDialogRegistry = new Map();
let addonDockFlushTimer = 0;

function emitAddonCommand(addonId, command, detail = {}) {
  window.dispatchEvent(
    new CustomEvent(ADDON_COMMAND_EVENT, {
      detail: {
        addonId,
        command,
        ...detail,
      },
    }),
  );
}

export function sanitizeDockButtons(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      const id = String(entry?.id || "").trim();
      const label = String(entry?.label || "").trim();
      if (!id || !label) return null;

      const variant = String(entry?.variant || "primary")
        .trim()
        .toLowerCase();

      return {
        id,
        label,
        title: String(entry?.title || "").trim(),
        disabled: Boolean(entry?.disabled),
        variant:
          variant === "secondary" || variant === "saved" || variant === "primary"
            ? variant
            : "primary",
      };
    })
    .filter(Boolean)
    .slice(0, 4);
}

function getDockSlotElement() {
  const shadowRoot = stateManager.get("shadowRoot");
  if (!shadowRoot?.getElementById) return null;
  return shadowRoot.getElementById(ADDON_DOCK_SLOT_ID);
}

function buildDockGroupId(addonId) {
  return `f95ue-addon-dock-${String(addonId || "")}`;
}

function removeAddonDockGroup(addonId) {
  const slot = getDockSlotElement();
  if (!slot) return;
  const group = slot.querySelector(`#${buildDockGroupId(addonId)}`);
  if (group?.parentNode) {
    group.parentNode.removeChild(group);
  }
}

function renderAddonDockGroup(addonId, buttons) {
  const slot = getDockSlotElement();
  if (!slot) return false;

  const groupId = buildDockGroupId(addonId);
  let group = slot.querySelector(`#${groupId}`);
  if (!group) {
    group = document.createElement("div");
    group.id = groupId;
    group.className = "f95ue-page-dock-group";
    group.dataset.addonId = addonId;
    slot.appendChild(group);
  }

  group.innerHTML = "";

  buttons.forEach((entry) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "f95ue-page-dock-btn";
    if (entry.variant === "secondary") {
      button.classList.add("secondary");
    } else if (entry.variant === "saved") {
      button.classList.add("saved");
    }
    button.disabled = Boolean(entry.disabled);
    button.dataset.addonId = addonId;
    button.dataset.actionId = entry.id;
    button.textContent = entry.label;
    if (entry.title) {
      button.title = entry.title;
    }

    button.addEventListener("click", () => {
      emitAddonCommand(addonId, "dock-action", { actionId: entry.id });
    });

    group.appendChild(button);
  });

  return true;
}

function flushAddonDockButtons() {
  const slot = getDockSlotElement();
  if (!slot) return false;

  addonDockButtonsState.forEach((buttons, addonId) => {
    if (!Array.isArray(buttons) || buttons.length === 0) {
      removeAddonDockGroup(addonId);
      return;
    }
    renderAddonDockGroup(addonId, buttons);
  });

  return true;
}

function scheduleAddonDockFlush() {
  if (addonDockFlushTimer) return;

  let remainingAttempts = 40;
  const tick = () => {
    addonDockFlushTimer = 0;

    if (flushAddonDockButtons()) {
      return;
    }

    remainingAttempts -= 1;
    if (remainingAttempts <= 0) return;
    addonDockFlushTimer = window.setTimeout(tick, 250);
  };

  addonDockFlushTimer = window.setTimeout(tick, 0);
}

export function sanitizeAddonStyleId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function getAddonStyleBucket(addonId) {
  if (!addonStyleRegistry.has(addonId)) {
    addonStyleRegistry.set(addonId, new Map());
  }
  return addonStyleRegistry.get(addonId);
}

export function sanitizeAddonMountId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function sanitizeAddonDialogId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function getAddonDialogBucket(addonId) {
  if (!addonDialogRegistry.has(addonId)) {
    addonDialogRegistry.set(addonId, new Map());
  }
  return addonDialogRegistry.get(addonId);
}

function ensureAddonDialogHost() {
  let host = document.getElementById(ADDON_DIALOG_HOST_ID);
  if (host) return host;

  host = document.createElement("div");
  host.id = ADDON_DIALOG_HOST_ID;
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.zIndex = "12040";
  host.style.pointerEvents = "none";
  document.body.appendChild(host);
  return host;
}

function ensureAddonPanelHost() {
  let host = document.getElementById(ADDON_PANEL_HOST_ID);
  if (host) return host;

  host = document.createElement("div");
  host.id = ADDON_PANEL_HOST_ID;
  host.dataset.addonSlot = "page.panel";
  document.body.appendChild(host);
  return host;
}

function ensureAddonFloatingHost() {
  let host = document.getElementById(ADDON_FLOATING_HOST_ID);
  if (host) return host;

  host = document.createElement("div");
  host.id = ADDON_FLOATING_HOST_ID;
  host.dataset.addonSlot = "page.floating";
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.zIndex = "9000";
  host.style.pointerEvents = "auto";
  document.body.appendChild(host);
  return host;
}

function listFocusableInDialog(rootEl) {
  if (!rootEl) return [];
  return [...rootEl.querySelectorAll("button, [href], input, select, textarea, [tabindex]")].filter(
    (node) => {
      if (!(node instanceof HTMLElement)) return false;
      if (node.tabIndex < 0) return false;
      if (node.hasAttribute("disabled")) return false;
      return node.offsetParent !== null || node === document.activeElement;
    },
  );
}

function trapDialogFocus(event, surfaceEl) {
  if (event.key !== "Tab") return;
  const focusable = listFocusableInDialog(surfaceEl);
  if (focusable.length === 0) {
    event.preventDefault();
    surfaceEl?.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
    return;
  }

  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  }
}

function dispatchAddonDialogClosed(addonId, dialogId, reason) {
  emitAddonCommand(addonId, "dialog-closed", {
    dialogId,
    reason: String(reason || ""),
  });
}

function resolveAddonDialogSurfaceMetrics(payload = {}) {
  const requestedSize = String(payload?.size || payload?.dialogSize || "")
    .trim()
    .toLowerCase();

  if (requestedSize === "full") {
    return {
      width: "calc(100vw - 24px)",
      maxHeight: "calc(100vh - 24px)",
      overlayPadding: "12px",
      overlayAlignItems: "center",
    };
  }

  if (requestedSize === "xl") {
    return {
      width: "min(1320px, calc(100vw - 24px))",
      maxHeight: "calc(100vh - 32px)",
      overlayPadding: "16px",
      overlayAlignItems: "center",
    };
  }

  if (requestedSize === "lg") {
    return {
      width: "min(1040px, calc(100vw - 24px))",
      maxHeight: "calc(100vh - 48px)",
      overlayPadding: "40px 16px 16px",
      overlayAlignItems: "flex-start",
    };
  }

  if (requestedSize === "sm") {
    return {
      width: "min(520px, calc(100vw - 24px))",
      maxHeight: "calc(100vh - 96px)",
      overlayPadding: "72px 16px 16px",
      overlayAlignItems: "flex-start",
    };
  }

  return {
    width: "min(720px, calc(100vw - 24px))",
    maxHeight: "calc(100vh - 96px)",
    overlayPadding: "72px 16px 16px",
    overlayAlignItems: "flex-start",
  };
}

function closeAddonDialogInternal(addonId, dialogId, reason = "close") {
  const bucket = addonDialogRegistry.get(addonId);
  const normalizedDialogId = sanitizeAddonDialogId(dialogId);
  if (!bucket || !normalizedDialogId) return { removed: 0 };

  const entry = bucket.get(normalizedDialogId);
  if (!entry) return { removed: 0 };

  if (entry.overlayEl?.parentNode) {
    entry.overlayEl.parentNode.removeChild(entry.overlayEl);
  }

  bucket.delete(normalizedDialogId);
  if (bucket.size === 0) addonDialogRegistry.delete(addonId);

  dispatchAddonDialogClosed(addonId, normalizedDialogId, reason);
  return { removed: 1 };
}

function removeAddonDialogs(addonId, dialogId = "", reason = "force-cleanup") {
  const bucket = addonDialogRegistry.get(addonId);
  if (!bucket || bucket.size === 0) return { removed: 0 };

  const normalizedDialogId = sanitizeAddonDialogId(dialogId);
  if (normalizedDialogId) {
    return closeAddonDialogInternal(addonId, normalizedDialogId, reason);
  }

  let removed = 0;
  const dialogIds = [...bucket.keys()];
  dialogIds.forEach((nextDialogId) => {
    const result = closeAddonDialogInternal(addonId, nextDialogId, reason);
    removed += Number(result?.removed || 0);
  });
  return { removed };
}

function getAddonMountBucket(addonId) {
  if (!addonMountRegistry.has(addonId)) {
    addonMountRegistry.set(addonId, new Map());
  }
  return addonMountRegistry.get(addonId);
}

function resolveAddonMountHost(slot) {
  const normalizedSlot = String(slot || "")
    .trim()
    .toLowerCase();
  if (!normalizedSlot || normalizedSlot === "body") return document.body;
  if (normalizedSlot === "latest.filters.after-title") {
    return document.querySelector(".content-block_filter-title");
  }
  if (normalizedSlot === "page.dock") return getDockSlotElement();
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

function removeAddonMounts(addonId, mountId = "") {
  const bucket = addonMountRegistry.get(addonId);
  if (!bucket || bucket.size === 0) return { removed: 0 };

  const normalizedMountId = sanitizeAddonMountId(mountId);
  if (normalizedMountId) {
    const mountEl = bucket.get(normalizedMountId);
    if (mountEl?.parentNode) {
      mountEl.parentNode.removeChild(mountEl);
    }
    bucket.delete(normalizedMountId);
    if (bucket.size === 0) addonMountRegistry.delete(addonId);
    return { removed: mountEl ? 1 : 0 };
  }

  let removed = 0;
  bucket.forEach((mountEl) => {
    if (mountEl?.parentNode) {
      mountEl.parentNode.removeChild(mountEl);
      removed += 1;
    }
  });
  addonMountRegistry.delete(addonId);
  return { removed };
}

function insertAddonMountElement(host, mountEl, position) {
  const normalizedPosition = String(position || "append")
    .trim()
    .toLowerCase();

  if (normalizedPosition === "before") {
    host.parentNode?.insertBefore(mountEl, host);
    return;
  }

  if (normalizedPosition === "after") {
    host.parentNode?.insertBefore(mountEl, host.nextSibling || null);
    return;
  }

  if (normalizedPosition === "prepend") {
    host.insertBefore(mountEl, host.firstChild || null);
    return;
  }

  host.appendChild(mountEl);
}

function removeAddonRegisteredStyles(addonId, styleId = "") {
  const bucket = addonStyleRegistry.get(addonId);
  if (!bucket || bucket.size === 0) return { removed: 0 };

  const normalizedStyleId = sanitizeAddonStyleId(styleId);
  if (normalizedStyleId) {
    const styleEl = bucket.get(normalizedStyleId);
    if (styleEl?.parentNode) {
      styleEl.parentNode.removeChild(styleEl);
    }
    bucket.delete(normalizedStyleId);
    if (bucket.size === 0) addonStyleRegistry.delete(addonId);
    return { removed: styleEl ? 1 : 0 };
  }

  let removed = 0;
  bucket.forEach((styleEl) => {
    if (styleEl?.parentNode) {
      styleEl.parentNode.removeChild(styleEl);
      removed += 1;
    }
  });
  addonStyleRegistry.delete(addonId);
  return { removed };
}

export function setAddonDockButtons(addonId, buttons) {
  if (buttons.length === 0) {
    addonDockButtonsState.delete(addonId);
    removeAddonDockGroup(addonId);
    return { rendered: true, count: 0 };
  }

  addonDockButtonsState.set(addonId, buttons);
  const rendered = renderAddonDockGroup(addonId, buttons);
  if (!rendered) scheduleAddonDockFlush();
  return { rendered, count: buttons.length };
}

export function removeAddonDockButtons(addonId) {
  addonDockButtonsState.delete(addonId);
  removeAddonDockGroup(addonId);
  return { removed: 1 };
}

export function mountAddonUi(addonId, payload = {}) {
  const mountId = sanitizeAddonMountId(payload?.mountId || payload?.id || "");
  const html = String(payload?.html || payload?.template || "");
  const slot = String(payload?.slot || "body");
  const position = String(payload?.position || "append");

  const host = resolveAddonMountHost(slot);
  if (!host) return { ok: false, reason: "mount_slot_not_found" };

  const bucket = getAddonMountBucket(addonId);
  const existing = bucket.get(mountId);

  if (existing) {
    existing.innerHTML = html;
    return { ok: true, value: { updated: true, mountId } };
  }

  const mountEl = document.createElement("div");
  mountEl.id = `f95ue-addon-mount-${addonId}-${mountId}`;
  mountEl.dataset.addonId = addonId;
  mountEl.dataset.addonMountId = mountId;
  if (String(slot || "").trim().toLowerCase() === "page.dock") {
    mountEl.style.display = "contents";
  }
  mountEl.innerHTML = html;

  insertAddonMountElement(host, mountEl, position);
  bucket.set(mountId, mountEl);

  return { ok: true, value: { updated: false, mountId } };
}

export function updateAddonUi(addonId, payload = {}) {
  const mountId = sanitizeAddonMountId(payload?.mountId || payload?.id || "");
  const html = String(payload?.html || payload?.template || "");

  const bucket = addonMountRegistry.get(addonId);
  const mountEl = bucket?.get(mountId);
  if (!mountEl) return { ok: false, reason: "mount_not_found" };

  mountEl.innerHTML = html;
  return { ok: true, value: { mountId } };
}

export function unmountAddonUi(addonId, mountId = "") {
  return { ok: true, value: removeAddonMounts(addonId, mountId) };
}

export function openAddonDialog(addonId, payload = {}) {
  const dialogId = sanitizeAddonDialogId(payload?.dialogId || payload?.id || "");
  const html = String(payload?.html || payload?.template || "");
  const title = String(payload?.title || "Dialog").trim();
  const closeOnEsc = payload?.closeOnEsc !== false;
  const closeOnBackdrop = payload?.closeOnBackdrop !== false;
  const surfaceMetrics = resolveAddonDialogSurfaceMetrics(payload);

  const host = ensureAddonDialogHost();
  const bucket = getAddonDialogBucket(addonId);

  closeAddonDialogInternal(addonId, dialogId, "replace");

  const overlayEl = document.createElement("div");
  overlayEl.className = "f95ue-addon-dialog-overlay";
  overlayEl.dataset.addonId = addonId;
  overlayEl.dataset.dialogId = dialogId;
  overlayEl.style.position = "fixed";
  overlayEl.style.inset = "0";
  overlayEl.style.display = "flex";
  overlayEl.style.alignItems = surfaceMetrics.overlayAlignItems;
  overlayEl.style.justifyContent = "center";
  overlayEl.style.padding = surfaceMetrics.overlayPadding;
  overlayEl.style.background = "rgba(7, 9, 13, 0.56)";
  overlayEl.style.pointerEvents = "auto";

  const surfaceEl = document.createElement("div");
  surfaceEl.className = "f95ue-addon-dialog-surface";
  surfaceEl.dataset.addonId = addonId;
  surfaceEl.dataset.dialogId = dialogId;
  surfaceEl.setAttribute("role", "dialog");
  surfaceEl.setAttribute("aria-modal", "true");
  surfaceEl.setAttribute("aria-label", title || "Dialog");
  surfaceEl.tabIndex = -1;
  surfaceEl.style.width = surfaceMetrics.width;
  surfaceEl.style.maxHeight = surfaceMetrics.maxHeight;
  surfaceEl.style.overflow = "auto";

  const contentEl = document.createElement("div");
  contentEl.className = "f95ue-addon-dialog-content";
  contentEl.id = `f95ue-addon-dialog-content-${addonId}-${dialogId}`;
  contentEl.innerHTML = html;

  surfaceEl.appendChild(contentEl);
  overlayEl.appendChild(surfaceEl);
  host.appendChild(overlayEl);

  overlayEl.addEventListener("click", (event) => {
    if (!closeOnBackdrop) return;
    if (event.target === overlayEl) {
      closeAddonDialogInternal(addonId, dialogId, "backdrop");
    }
  });

  overlayEl.addEventListener("keydown", (event) => {
    if (closeOnEsc && event.key === "Escape") {
      event.preventDefault();
      closeAddonDialogInternal(addonId, dialogId, "escape");
      return;
    }
    trapDialogFocus(event, surfaceEl);
  });

  bucket.set(dialogId, {
    overlayEl,
    surfaceEl,
    contentEl,
    closeOnEsc,
    closeOnBackdrop,
  });

  window.setTimeout(() => {
    const focusable = listFocusableInDialog(surfaceEl);
    if (focusable.length > 0) {
      focusable[0].focus();
      return;
    }
    surfaceEl.focus();
  }, 0);

  return {
    ok: true,
    value: {
      dialogId,
      contentId: contentEl.id,
    },
  };
}

export function closeAddonDialog(addonId, dialogId = "", reason = "addon-request") {
  return { ok: true, value: removeAddonDialogs(addonId, dialogId, reason) };
}

export function registerAddonStyle(addonId, payload = {}) {
  const styleId = sanitizeAddonStyleId(payload?.styleId || payload?.id || "");
  const cssText = String(payload?.cssText || payload?.css || "");

  const bucket = getAddonStyleBucket(addonId);
  const existing = bucket.get(styleId);
  if (existing) {
    existing.textContent = cssText;
    return { ok: true, value: { updated: true, styleId } };
  }

  const styleEl = document.createElement("style");
  styleEl.id = `f95ue-addon-style-${addonId}-${styleId}`;
  styleEl.dataset.addonId = addonId;
  styleEl.dataset.addonStyleId = styleId;
  styleEl.textContent = cssText;
  document.head.appendChild(styleEl);
  bucket.set(styleId, styleEl);

  return { ok: true, value: { updated: false, styleId } };
}

export function unregisterAddonStyle(addonId, styleId = "") {
  return { ok: true, value: removeAddonRegisteredStyles(addonId, styleId) };
}

export function cleanupAddonUi(addonId) {
  addonDockButtonsState.delete(addonId);
  removeAddonDockGroup(addonId);
  removeAddonRegisteredStyles(addonId);
  removeAddonMounts(addonId);
  removeAddonDialogs(addonId);
}
