export function createImageRepairStatusUi({ addonId = "site-repair-addon" } = {}) {
  const wrapperId = "site-repair-image-status";
  const cssText = `#${wrapperId}{position:fixed;top:20px;right:20px;z-index:99999;pointer-events:none;background:rgba(0,0,0,.85);color:#fff;padding:10px 15px;border-radius:8px;font:13px sans-serif}`;
  function update(count) {
    let root = document.getElementById(wrapperId);
    if (count <= 0) { root?.remove(); return; }
    if (!root) {
      root = document.createElement("div");
      root.id = wrapperId;
      root.dataset.addonId = addonId;
      document.body.appendChild(root);
    }
    root.textContent = `Retrying ${count} image${count === 1 ? "" : "s"}...`;
  }
  return { cssText, update, destroy: () => document.getElementById(wrapperId)?.remove() };
}
