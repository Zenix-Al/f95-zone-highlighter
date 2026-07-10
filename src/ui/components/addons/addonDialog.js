import { createEl } from "../../../utils/dom.js";

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

export function trapAddonDialogFocus(event, surfaceEl) {
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

export function focusAddonDialog(surfaceEl) {
  window.setTimeout(() => {
    const focusable = listFocusableInDialog(surfaceEl);
    if (focusable.length > 0) {
      focusable[0].focus();
      return;
    }
    surfaceEl.focus();
  }, 0);
}

export function createAddonDialogElements({
  addonId,
  dialogId,
  title = "Dialog",
  html = "",
  payload = {},
} = {}) {
  const surfaceMetrics = resolveAddonDialogSurfaceMetrics(payload);

  const overlayEl = createEl("div", {
    className: "f95ue-addon-dialog-overlay",
    attrs: {
      "data-addon-id": addonId,
      "data-dialog-id": dialogId,
    },
    style: {
      position: "fixed",
      inset: "0",
      display: "flex",
      alignItems: surfaceMetrics.overlayAlignItems,
      justifyContent: "center",
      padding: surfaceMetrics.overlayPadding,
      background: "rgba(7, 9, 13, 0.56)",
      pointerEvents: "auto",
    },
  });

  const surfaceEl = createEl("div", {
    className: "f95ue-addon-dialog-surface",
    attrs: {
      "data-addon-id": addonId,
      "data-dialog-id": dialogId,
      role: "dialog",
      "aria-modal": "true",
      "aria-label": title || "Dialog",
      tabIndex: -1,
    },
    style: {
      width: surfaceMetrics.width,
      maxHeight: surfaceMetrics.maxHeight,
      overflow: "auto",
    },
  });

  const contentEl = createEl("div", {
    className: "f95ue-addon-dialog-content",
    attrs: {
      id: `f95ue-addon-dialog-content-${addonId}-${dialogId}`,
      "data-addon-id": addonId,
      "data-dialog-id": dialogId,
    },
  });
  contentEl.innerHTML = html;

  surfaceEl.appendChild(contentEl);
  overlayEl.appendChild(surfaceEl);

  return { overlayEl, surfaceEl, contentEl };
}
