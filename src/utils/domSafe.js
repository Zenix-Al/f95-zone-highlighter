/**
 * Safe DOM helpers — lightweight utilities to avoid uncaught DOM errors
 * Use these to query and mutate DOM elements when the presence of nodes
 * cannot be guaranteed (SPAs, dynamic content, torn-down nodes).
 */

export function safeQuery(parent, selector) {
  try {
    if (!parent || typeof selector !== "string") return null;
    if (typeof parent.querySelector === "function") return parent.querySelector(selector);
    // fallback to document
    return document.querySelector(selector);
  } catch (err) {
    console.warn("safeQuery failed", selector, err);
    return null;
  }
}

export function safeQueryAll(parent, selector) {
  try {
    if (!parent || typeof selector !== "string") return [];
    const nodeList =
      typeof parent.querySelectorAll === "function"
        ? parent.querySelectorAll(selector)
        : document.querySelectorAll(selector);
    return Array.from(nodeList || []);
  } catch (err) {
    console.warn("safeQueryAll failed", selector, err);
    return [];
  }
}

export function safeSetDataset(el, key, value) {
  try {
    if (!el || !el.dataset || typeof key !== "string") return false;
    el.dataset[key] = value;
    return true;
  } catch (err) {
    console.warn("safeSetDataset failed", key, err);
    return false;
  }
}

export function safeAssignStyle(el, styles) {
  try {
    if (!el || !el.style || typeof styles !== "object" || styles === null) return false;
    Object.assign(el.style, styles);
    return true;
  } catch (err) {
    console.warn("safeAssignStyle failed", err);
    return false;
  }
}

export function safeText(el, text) {
  try {
    if (!el) return false;
    el.textContent = text == null ? "" : String(text);
    return true;
  } catch (err) {
    console.warn("safeText failed", err);
    return false;
  }
}

export default {
  safeQuery,
  safeQueryAll,
  safeSetDataset,
  safeAssignStyle,
  safeText,
};
