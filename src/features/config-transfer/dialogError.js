import stateManager from "../../config.js";
import { showToast } from "../../ui/components/toast.js";
import {
  CONFIG_TRANSFER_DIALOG_ID,
  CONFIG_TRANSFER_ERROR_ID,
  ERROR_TOAST_DURATION,
} from "./constants.js";

function getConfigTransferDialogPanel() {
  const shadowRoot = stateManager.get("shadowRoot");
  if (!shadowRoot) return null;

  const dialog = shadowRoot.getElementById(CONFIG_TRANSFER_DIALOG_ID);
  if (!dialog) return null;

  return dialog.querySelector(".config-dialog-panel");
}

export function ensureConfigTransferErrorElement() {
  const panel = getConfigTransferDialogPanel();
  if (!panel) return null;

  let el = panel.querySelector(`#${CONFIG_TRANSFER_ERROR_ID}`);
  if (el) return el;

  el = document.createElement("div");
  el.id = CONFIG_TRANSFER_ERROR_ID;
  el.className = "config-transfer-dialog-error";
  el.style.display = "none";

  const actions = panel.querySelector(".config-dialog-actions");
  if (actions) {
    panel.insertBefore(el, actions);
  } else {
    panel.appendChild(el);
  }

  return el;
}

export function clearConfigTransferError() {
  const panel = getConfigTransferDialogPanel();
  if (!panel) return;

  const el = panel.querySelector(`#${CONFIG_TRANSFER_ERROR_ID}`);
  if (!el) return;

  el.textContent = "";
  el.style.display = "none";
}

export function showConfigTransferError(message) {
  const text = String(message || "").trim();
  if (!text) return;

  const el = ensureConfigTransferErrorElement();
  if (el) {
    el.textContent = text;
    el.style.display = "block";
  }

  showToast(text, ERROR_TOAST_DURATION);
}
