import { renderSetting } from "../renderers/renderSetting.js";
import { createEl } from "../../core/dom.js";
import { createRegistrar } from "../../core/listenerRegistry.js";
import { getShadowRoot } from "../getShadowRoot.js";
const ACTIVE_DIALOG_ID = "latest-config-dialog";

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
  multiline = false,
  readOnly = false,
} = {}) {
  const shadowRoot = getShadowRoot();
  if (!shadowRoot) return Promise.resolve(null);

  removeDialogIfExists();

  return new Promise((resolve) => {
    const backdrop = createEl("div", {
      attrs: { id: ACTIVE_DIALOG_ID },
      className: "config-dialog-backdrop",
    });

    const panel = createEl("div", { className: "config-dialog-panel" });

    const header = createEl("div", { className: "config-dialog-title", text: title });

    const body = createEl("div", { className: "config-dialog-description", text: description });

    const input = multiline
      ? createEl("textarea", { className: "config-dialog-input" })
      : createEl("input", { className: "config-dialog-input" });
    if (!multiline) input.type = "text";
    input.placeholder = placeholder;
    input.value = defaultValue;
    input.readOnly = Boolean(readOnly);
    if (multiline) {
      input.rows = 10;
      input.style.resize = "vertical";
      input.style.minHeight = "160px";
    }

    const error = createEl("div", { className: "config-dialog-error" });

    const actions = createEl("div", { className: "config-dialog-actions" });

    const cancelBtn = createEl("button", {
      className: "modal-btn dialog-cancel",
      attrs: { type: "button" },
      text: cancelLabel,
    });
    const submitBtn = createEl("button", {
      className: "modal-btn dialog-submit",
      attrs: { type: "button" },
      text: submitLabel,
    });

    actions.append(cancelBtn, submitBtn);

    const frag = document.createDocumentFragment();
    frag.append(header, body, input, error, actions);
    panel.appendChild(frag);
    backdrop.appendChild(panel);
    shadowRoot.appendChild(backdrop);

    let done = false;
    const { reg, dispose } = createRegistrar("dialog-textprompt");

    const close = (value) => {
      if (done) return;
      done = true;
      dispose();
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

    reg(cancelBtn, "click", () => close(null));
    reg(submitBtn, "click", submit);
    reg(backdrop, "click", (e) => {
      if (e.target === backdrop) close(null);
    });

    const keydownHandler = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(null);
        return;
      }
      if (!multiline && e.key === "Enter") {
        e.preventDefault();
        submit();
      }
      if (multiline && e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        submit();
      }
    };

    reg(input, "keydown", keydownHandler);
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  });
}

export function openReorderDialog({
  title = "Reorder",
  description = "",
  items = [],
  submitLabel = "Save",
  cancelLabel = "Cancel",
} = {}) {
  const shadowRoot = getShadowRoot();
  if (!shadowRoot) return Promise.resolve(null);

  removeDialogIfExists();

  return new Promise((resolve) => {
    // Working copy so cancel discards changes
    let order = items.map((i) => ({ ...i }));

    const backdrop = createEl("div", {
      attrs: { id: ACTIVE_DIALOG_ID },
      className: "config-dialog-backdrop",
    });

    const panel = createEl("div", { className: "config-dialog-panel" });

    const header = createEl("div", { className: "config-dialog-title", text: title });

    const body = createEl("div", { className: "config-dialog-description", text: description });

    const list = createEl("div", { className: "config-reorder-list" });

    function rebuildList() {
      list.innerHTML = "";
      order.forEach((item, idx) => {
        const row = createEl("div", { className: "config-reorder-item" });

        const label = createEl("span", { className: "config-reorder-label", text: item.label });

        const handle = createEl("div", { className: "config-reorder-handle" });

        const upBtn = createEl("button", {
          className: "config-reorder-btn",
          attrs: { type: "button" },
          text: "▲",
        });
        upBtn.disabled = idx === 0;
        upBtn.addEventListener("click", () => {
          if (idx === 0) return;
          [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
          rebuildList();
        });

        const downBtn = createEl("button", {
          className: "config-reorder-btn",
          attrs: { type: "button" },
          text: "▼",
        });
        downBtn.disabled = idx === order.length - 1;
        downBtn.addEventListener("click", () => {
          if (idx === order.length - 1) return;
          [order[idx], order[idx + 1]] = [order[idx + 1], order[idx]];
          rebuildList();
        });

        handle.append(upBtn, downBtn);
        row.append(label, handle);
        list.appendChild(row);
      });
    }

    rebuildList();

    const actions = createEl("div", { className: "config-dialog-actions" });

    const cancelBtn = createEl("button", {
      className: "modal-btn dialog-cancel",
      attrs: { type: "button" },
      text: cancelLabel,
    });
    const submitBtn = createEl("button", {
      className: "modal-btn dialog-submit",
      attrs: { type: "button" },
      text: submitLabel,
    });

    actions.append(cancelBtn, submitBtn);

    const frag = document.createDocumentFragment();
    frag.append(header);
    if (description) frag.append(body);
    frag.append(list, actions);
    panel.appendChild(frag);
    backdrop.appendChild(panel);
    shadowRoot.appendChild(backdrop);

    let done = false;
    const { reg: regReorder, dispose: disposeReorder } = createRegistrar("dialog-reorder");

    const close = (value) => {
      if (done) return;
      done = true;
      disposeReorder();
      backdrop.remove();
      resolve(value);
    };

    regReorder(cancelBtn, "click", () => close(null));
    regReorder(submitBtn, "click", () => close(order.map((i) => i.key)));
    regReorder(backdrop, "click", (e) => {
      if (e.target === backdrop) close(null);
    });
    regReorder(backdrop, "keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(null);
      }
    });
  });
}

export function openSettingsDialog({
  title = "Settings",
  description = "",
  metaMap = {},
  closeLabel = "Close",
} = {}) {
  const shadowRoot = getShadowRoot();
  if (!shadowRoot) return null;

  removeDialogIfExists();
  const backdrop = createEl("div", {
    attrs: { id: ACTIVE_DIALOG_ID },
    className: "config-dialog-backdrop",
  });

  const panel = createEl("div", { className: "config-dialog-panel" });

  const header = createEl("div", { className: "config-dialog-title", text: title });

  const frag = document.createDocumentFragment();
  frag.append(header);

  if (description) {
    const body = createEl("div", { className: "config-dialog-description", text: description });
    frag.append(body);
  }

  const content = createEl("div", { className: "config-dialog-settings" });
  Object.entries(metaMap).forEach(([key, meta]) => {
    content.appendChild(renderSetting(`dialog-${key}`, meta));
  });
  frag.append(content);

  const actions = createEl("div", { className: "config-dialog-actions" });
  const closeBtn = createEl("button", {
    className: "modal-btn dialog-cancel",
    attrs: { type: "button" },
    text: closeLabel,
  });
  actions.append(closeBtn);
  frag.append(actions);

  panel.appendChild(frag);
  backdrop.appendChild(panel);
  shadowRoot.appendChild(backdrop);

  let done = false;
  const { reg: regSettings, dispose: disposeSettings } = createRegistrar("dialog-settings");

  const close = () => {
    if (done) return;
    done = true;
    disposeSettings();
    backdrop.remove();
  };

  const keydownHandler = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  regSettings(closeBtn, "click", close);
  regSettings(backdrop, "click", (e) => {
    if (e.target === backdrop) close();
  });
  regSettings(document, "keydown", keydownHandler, true);

  return {
    backdrop,
    panel,
    content,
    close,
  };
}
