export function createAddonUi({ addonId, buttonClass, addTeardown }) {
  let toastEl = null;

  function ensureButtonStyle() {
    const styleId = `f95ue-addon-style-${addonId}`;
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .${buttonClass} {
        margin-left: 6px;
        padding: 2px 6px;
        border: 1px solid rgba(255, 255, 255, 0.25);
        border-radius: 4px;
        color: #fff;
        cursor: pointer;
        font-size: 11px;
        line-height: 1.2;
        vertical-align: middle;
        transition: opacity 0.15s, background 0.2s;
      }
      .${buttonClass}[data-action-type="masked"] {
        background: rgba(137, 56, 57, 0.85);
      }
      .${buttonClass}[data-action-type="direct"] {
        background: rgba(30, 90, 160, 0.85);
      }
      .${buttonClass}[data-resolved="true"] {
        background: rgba(0, 128, 0, 0.85);
      }
      .${buttonClass}:disabled {
        opacity: 0.55;
        cursor: wait;
      }
      #f95ue-addon-toast {
        position: fixed;
        bottom: 14px;
        right: 14px;
        z-index: 999999;
        background: rgba(16, 18, 21, 0.92);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 8px;
        color: #f3f3f3;
        font-size: 12px;
        line-height: 1.4;
        padding: 8px 10px;
        max-width: 320px;
        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.35);
        display: none;
      }
    `;

    document.head.appendChild(style);
  }

  function showToast(message, duration = 2600) {
    ensureButtonStyle();
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.id = "f95ue-addon-toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = String(message || "");
    toastEl.style.display = "block";

    const timer = setTimeout(() => {
      if (toastEl) toastEl.style.display = "none";
    }, duration);
    addTeardown(() => clearTimeout(timer));
  }

  return {
    ensureButtonStyle,
    showToast,
  };
}
