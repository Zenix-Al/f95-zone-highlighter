export function createAddonStyleElement(addonId, styleId, cssText) {
  const styleEl = document.createElement("style");
  styleEl.id = `f95ue-addon-style-${addonId}-${styleId}`;
  styleEl.dataset.addonId = addonId;
  styleEl.dataset.addonStyleId = styleId;
  styleEl.textContent = cssText;
  return styleEl;
}
