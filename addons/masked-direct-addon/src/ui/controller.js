export function createAddonUi({ addonId, buttonClass, addTeardown }) {
  let styleInjected = false;

  const styleId = `f95ue-addon-style-${addonId}`;
  const cssText = `
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
    `;

  function ensureLocalButtonStyle() {
    if (styleInjected || document.getElementById(styleId)) return;
    
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = cssText;
    document.head.appendChild(style);
    styleInjected = true;
    
    addTeardown(() => {
      style.remove?.();
      styleInjected = false;
    });
  }

  return {
    styleId,
    cssText,
    ensureLocalButtonStyle,
  };
}
