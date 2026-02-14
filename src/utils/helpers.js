import { showToast } from "../ui/components/toast.js";

export function preserveOriginalSrc(img) {
  try {
    if (!img || !img.dataset) return;
    if (!img.dataset.originalSrc) img.dataset.originalSrc = img.src || "";
  } catch {
    // best-effort — don't break callers
  }
}

export function styleElement(el, style = {}) {
  if (!el || !el.style) return;
  try {
    Object.assign(el.style, style);
  } catch {
    // swallow — styling failure shouldn't break flow
  }
}

export function styleDownloadSuccess(el, overrides = {}) {
  const defaults = {
    fontWeight: "bold",
    textDecoration: "none",
    boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
    background: "#ec5555",
    color: "white",
    padding: "16px 24px",
    borderRadius: "12px",
    position: "fixed",
    bottom: "20px",
    right: "20px",
    zIndex: 99999,
    fontSize: "16px",
  };
  styleElement(el, Object.assign({}, defaults, overrides));
}

export function toastToggle(name, enabled) {
  try {
    showToast(`${name} ${enabled ? "enabled" : "disabled"}`);
  } catch {
    // ignore
  }
}
