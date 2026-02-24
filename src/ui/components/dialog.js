import stateManager from "../../config.js";
import { renderSetting } from "../renderers/renderSetting.js";

const ACTIVE_DIALOG_ID = "latest-config-dialog";

function getShadowRoot() {
  return stateManager.get("shadowRoot");
}

function removeDialogIfExists() {
  const shadowRoot = getShadowRoot();
  if (!shadowRoot) return;
  const existing = shadowRoot.getElementById(ACTIVE_DIALOG_ID);
  if (existing) existing.remove();
}

export function openTextPrompt({
  title = "Input",
  description = "",
  defaultValue = "",
  placeholder = "",
  submitLabel = "Save",
  cancelLabel = "Cancel",
  validate = null,
} = {}) {
  const shadowRoot = getShadowRoot();
  if (!shadowRoot) return Promise.resolve(null);

  removeDialogIfExists();

  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.id = ACTIVE_DIALOG_ID;
    backdrop.className = "config-dialog-backdrop";

    const panel = document.createElement("div");
    panel.className = "config-dialog-panel";

    const header = document.createElement("div");
    header.className = "config-dialog-title";
    header.textContent = title;

    const body = document.createElement("div");
    body.className = "config-dialog-description";
    body.textContent = description;

    const input = document.createElement("input");
    input.className = "config-dialog-input";
    input.type = "text";
    input.placeholder = placeholder;
    input.value = defaultValue;

    const error = document.createElement("div");
    error.className = "config-dialog-error";

    const actions = document.createElement("div");
    actions.className = "config-dialog-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "modal-btn dialog-cancel";
    cancelBtn.type = "button";
    cancelBtn.textContent = cancelLabel;

    const submitBtn = document.createElement("button");
    submitBtn.className = "modal-btn dialog-submit";
    submitBtn.type = "button";
    submitBtn.textContent = submitLabel;

    actions.appendChild(cancelBtn);
    actions.appendChild(submitBtn);

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(input);
    panel.appendChild(error);
    panel.appendChild(actions);
    backdrop.appendChild(panel);
    shadowRoot.appendChild(backdrop);

    let done = false;

    const close = (value) => {
      if (done) return;
      done = true;
      backdrop.remove();
      resolve(value);
    };

    const submit = () => {
      const value = input.value.trim();
      if (typeof validate === "function") {
        const validationError = validate(value);
        if (typeof validationError === "string" && validationError) {
          error.textContent = validationError;
          return;
        }
      }
      close(value);
    };

    cancelBtn.addEventListener("click", () => close(null));
    submitBtn.addEventListener("click", submit);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close(null);
    });

    const keydownHandler = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(null);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    };

    input.addEventListener("keydown", keydownHandler);
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  });
}

export function openSettingsDialog({
  title = "Settings",
  description = "",
  metaMap = {},
  closeLabel = "Close",
} = {}) {
  const shadowRoot = getShadowRoot();
  if (!shadowRoot) return;

  removeDialogIfExists();

  const backdrop = document.createElement("div");
  backdrop.id = ACTIVE_DIALOG_ID;
  backdrop.className = "config-dialog-backdrop";

  const panel = document.createElement("div");
  panel.className = "config-dialog-panel";

  const header = document.createElement("div");
  header.className = "config-dialog-title";
  header.textContent = title;

  panel.appendChild(header);

  if (description) {
    const body = document.createElement("div");
    body.className = "config-dialog-description";
    body.textContent = description;
    panel.appendChild(body);
  }

  const content = document.createElement("div");
  content.className = "config-dialog-settings";
  Object.entries(metaMap).forEach(([key, meta]) => {
    content.appendChild(renderSetting(`dialog-${key}`, meta));
  });
  panel.appendChild(content);

  const actions = document.createElement("div");
  actions.className = "config-dialog-actions";
  const closeBtn = document.createElement("button");
  closeBtn.className = "modal-btn dialog-cancel";
  closeBtn.type = "button";
  closeBtn.textContent = closeLabel;
  actions.appendChild(closeBtn);
  panel.appendChild(actions);

  backdrop.appendChild(panel);
  shadowRoot.appendChild(backdrop);

  let done = false;
  const close = () => {
    if (done) return;
    done = true;
    document.removeEventListener("keydown", keydownHandler, true);
    backdrop.remove();
  };

  const keydownHandler = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener("keydown", keydownHandler, true);
}
