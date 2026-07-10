import { TIMINGS } from "../config/timings.js";

export function waitFor(conditionFn, interval = TIMINGS.TILE_POPULATE_CHECK_INTERVAL, timeout = TIMINGS.TILE_POPULATE_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (conditionFn()) resolve(true);
      else if (Date.now() - start > timeout) reject(new Error("Timeout waiting for condition"));
      else setTimeout(check, interval);
    };
    check();
  });
}

export function waitForBody(callback) {
  if (document.body) callback();
  else requestAnimationFrame(() => waitForBody(callback));
}

export function waitForBodyReady() {
  return new Promise((resolve) => waitForBody(resolve));
}

/** Create an element with optional attributes, children, styles, and mount. */
export function createEl(tag, { className, attrs, text, children, mount, style } = {}) {
  const doc = (mount && (mount.ownerDocument || (mount.host && mount.host.ownerDocument))) || document;
  const el = doc.createElement(tag);
  if (className) el.className = className;
  if (attrs) Object.keys(attrs).forEach((key) => el.setAttribute(key, attrs[key]));
  if (text != null) el.textContent = text;
  if (children && Array.isArray(children)) children.forEach((child) => el.appendChild(child));
  if (style) Object.assign(el.style, style);
  if (mount && typeof mount.appendChild === "function") {
    try { mount.appendChild(el); } catch {}
  }
  return el;
}
