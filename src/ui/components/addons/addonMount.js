import { createEl } from "../../../core/dom.js";

export function createAddonMountElement({ addonId, mountId, html = "", slot = "body" } = {}) {
  const mountEl = createEl("div", {
    attrs: {
      id: `f95ue-addon-mount-${addonId}-${mountId}`,
      className: "f95ue-addon-mount",
      "data-addon-id": addonId,
      "data-addon-mount-id": mountId,
    },
  });

  if (
    String(slot || "")
      .trim()
      .toLowerCase() === "page.dock"
  ) {
    mountEl.style.display = "contents";
  }

  mountEl.innerHTML = html;
  return mountEl;
}

export function insertAddonMountElement(host, mountEl, position) {
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
