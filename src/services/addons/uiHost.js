import { stateManager } from "../../config.js";
import { emitAddonCommand } from "./lifecycle.js";
import {
  buildAddonDockGroupId,
  createAddonDialogElements,
  createAddonDockGroup,
  createAddonMountElement,
  createAddonStyleElement,
  ensureAddonDialogHost,
  focusAddonDialog,
  getAddonDockSlotElement,
  insertAddonMountElement,
  resolveAddonMountHost,
  trapAddonDialogFocus,
} from "../../ui/components/addons/index.js";

const addonDockButtonsState = new Map();
const addonStyleRegistry = new Map();
const addonMountRegistry = new Map();
const addonDialogRegistry = new Map();
let addonDockFlushTimer = 0;

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
  return getAddonDockSlotElement(stateManager.get("shadowRoot"));
}

function removeAddonDockGroup(addonId) {
  const slot = getDockSlotElement();
  if (!slot) return;
  const group = slot.querySelector(`#${buildAddonDockGroupId(addonId)}`);
  if (group?.parentNode) {
    group.parentNode.removeChild(group);
  }
}

function renderAddonDockGroup(addonId, buttons) {
  const slot = getDockSlotElement();
  if (!slot) return false;

  createAddonDockGroup(slot, addonId, buttons, {
    onAction: (actionId) => emitAddonCommand(addonId, "dock-action", { actionId }),
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

function dispatchAddonDialogClosed(addonId, dialogId, reason) {
  emitAddonCommand(addonId, "dialog-closed", {
    dialogId,
    reason: String(reason || ""),
  });
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

  const host = resolveAddonMountHost(slot, { shadowRoot: stateManager.get("shadowRoot") });
  if (!host) return { ok: false, reason: "mount_slot_not_found" };

  const bucket = getAddonMountBucket(addonId);
  const existing = bucket.get(mountId);

  if (existing) {
    existing.innerHTML = html;
    return { ok: true, value: { updated: true, mountId } };
  }

  const mountEl = createAddonMountElement({
    addonId,
    mountId,
    html,
    slot,
  });

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

  const host = ensureAddonDialogHost();
  const bucket = getAddonDialogBucket(addonId);

  closeAddonDialogInternal(addonId, dialogId, "replace");

  const { overlayEl, surfaceEl, contentEl } = createAddonDialogElements({
    addonId,
    dialogId,
    title,
    html,
    payload,
  });

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
    trapAddonDialogFocus(event, surfaceEl);
  });

  bucket.set(dialogId, {
    overlayEl,
    surfaceEl,
    contentEl,
    closeOnEsc,
    closeOnBackdrop,
  });

  focusAddonDialog(surfaceEl);

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

  const styleEl = createAddonStyleElement(addonId, styleId, cssText);
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
