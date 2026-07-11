const ALLOWED_TAGS = new Set([
  "a", "article", "b", "blockquote", "br", "button", "code", "details", "div", "em",
  "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5",
  "h6", "header", "hr", "i", "img", "input", "label", "li", "main", "ol", "option",
  "p", "pre", "section", "select", "small", "span", "strong", "summary", "table", "tbody",
  "td", "textarea", "tfoot", "th", "thead", "tr", "u", "ul",
]);

const GLOBAL_ATTRIBUTES = new Set(["class", "id", "role", "title", "tabindex"]);
const TAG_ATTRIBUTES = {
  a: new Set(["href", "target", "rel", "download"]),
  button: new Set(["type", "disabled", "name", "value"]),
  form: new Set(["method"]),
  img: new Set(["src", "alt", "width", "height"]),
  input: new Set(["type", "name", "value", "placeholder", "checked", "disabled", "readonly", "min", "max", "step"]),
  label: new Set(["for"]),
  option: new Set(["value", "selected", "disabled"]),
  select: new Set(["name", "multiple", "disabled"]),
  td: new Set(["colspan", "rowspan"]),
  textarea: new Set(["name", "placeholder", "readonly", "disabled", "rows", "cols"]),
  th: new Set(["colspan", "rowspan", "scope"]),
};

const BLOCKED_TAGS = new Set(["base", "embed", "frame", "iframe", "link", "math", "meta", "object", "script", "style", "svg", "template"]);
const UNSAFE_URL = /^(?:javascript|vbscript|data):/i;
const MAX_STYLE_BYTES = 64 * 1024;

function escapeText(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function isAllowedAttribute(tagName, name) {
  return GLOBAL_ATTRIBUTES.has(name) || name.startsWith("aria-") || name.startsWith("data-") || TAG_ATTRIBUTES[tagName]?.has(name);
}

function isSafeUrl(value) {
  const normalized = String(value || "").trim().replace(/[\u0000-\u001f\u007f\s]+/g, "");
  return !UNSAFE_URL.test(normalized);
}

function sanitizeElement(element) {
  const tagName = String(element.tagName || "").toLowerCase();
  if (BLOCKED_TAGS.has(tagName) || !ALLOWED_TAGS.has(tagName)) {
    element.remove();
    return;
  }
  [...element.attributes].forEach((attribute) => {
    const name = String(attribute.name || "").toLowerCase();
    if (name.startsWith("on") || name === "srcdoc" || name === "style" || !isAllowedAttribute(tagName, name)) {
      element.removeAttribute(attribute.name);
      return;
    }
    if ((name === "href" || name === "src") && !isSafeUrl(attribute.value)) {
      element.removeAttribute(attribute.name);
    }
  });
  if (tagName === "a" && element.getAttribute("target") === "_blank") {
    element.setAttribute("rel", "noopener noreferrer");
  }
  [...element.children].forEach(sanitizeElement);
}

/**
 * Sanitizes every add-on HTML payload. The no-DOM fallback renders text rather
 * than attempting a second parser, so unsafe markup never becomes executable.
 */
export function sanitizeAddonHtml(value) {
  const html = String(value || "");
  if (typeof document === "undefined" || typeof document.createElement !== "function") {
    return escapeText(html);
  }
  const template = document.createElement("template");
  if (!template?.content) return escapeText(html);
  template.innerHTML = html;
  [...template.content.children].forEach(sanitizeElement);
  return template.innerHTML;
}

export const ADDON_UI_SLOT_POLICY = Object.freeze({
  "latest.filters.after-title": Object.freeze({ capability: "ui.mount", target: "page" }),
  "page.dock": Object.freeze({ capability: "ui.dock", target: "shadow" }),
  "page.floating": Object.freeze({ capability: "ui.mount", target: "page" }),
  "page.panel": Object.freeze({ capability: "ui.mount", target: "page" }),
});

export function normalizeAddonMountSlot(value) {
  const slot = String(value || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(ADDON_UI_SLOT_POLICY, slot) ? slot : "";
}

function hasUnsafeCssConstruct(cssText) {
  return /(?:@import|@namespace|@font-face|@document|expression\s*\(|-moz-binding|behavior\s*:|url\s*\(|<\/style)/i.test(cssText);
}

function splitCssRules(cssText) {
  const rules = [];
  let start = 0;
  let depth = 0;
  let quote = "";
  for (let index = 0; index < cssText.length; index += 1) {
    const char = cssText[index];
    if (quote) {
      if (char === quote && cssText[index - 1] !== "\\") quote = "";
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) { rules.push(cssText.slice(start, index + 1)); start = index + 1; }
      if (depth < 0) return null;
    }
  }
  return depth === 0 && !quote ? rules : null;
}

/**
 * Page-host styles are not arbitrary CSS. Rules are scoped to the outer owned
 * mount/dialog element, and global selectors plus risky at-rules are rejected.
 */
export function sanitizeAddonCss(addonId, value, { maxBytes = MAX_STYLE_BYTES } = {}) {
  const cssText = String(value || "");
  if (new TextEncoder().encode(cssText).length > maxBytes) return { ok: false, reason: "payload_too_large" };
  if (!cssText.trim()) return { ok: false, reason: "css_required" };
  if (hasUnsafeCssConstruct(cssText)) return { ok: false, reason: "unsafe_css" };
  const rules = splitCssRules(cssText);
  if (!rules) return { ok: false, reason: "invalid_css" };
  const scope = `[data-addon-id="${String(addonId).replace(/"/g, "")}"]`;
  const ownerToken = String(addonId || "").toLowerCase();
  const scopeRules = (sourceRules) => {
    const scoped = [];
    for (const rule of sourceRules) {
      const boundary = rule.indexOf("{");
      const selectorText = rule.slice(0, boundary).trim();
      const declarationText = rule.slice(boundary);
      if (!selectorText) return { ok: false, reason: "invalid_css" };
      if (selectorText.startsWith("@media")) {
        const nested = splitCssRules(declarationText.slice(1, -1));
        if (!nested) return { ok: false, reason: "invalid_css" };
        const nestedResult = scopeRules(nested);
        if (!nestedResult.ok) return nestedResult;
        scoped.push(`${selectorText}{${nestedResult.cssText}}`);
        continue;
      }
      if (selectorText.startsWith("@keyframes")) {
        const name = selectorText.replace(/^@(?:-[a-z]+-)?keyframes\s+/i, "").trim().toLowerCase();
        if (!name || !name.includes(ownerToken)) return { ok: false, reason: "unsafe_css_keyframes" };
        scoped.push(rule);
        continue;
      }
      if (selectorText.startsWith("@")) return { ok: false, reason: "unsupported_css_rule" };
      const selectors = selectorText.split(",").map((selector) => selector.trim());
      if (selectors.some((selector) => !selector || /(?:^|[\s>+~])(?:html|body|:root)(?:\b|\s|[>+~.#[:])|\*/i.test(selector))) {
        return { ok: false, reason: "unsafe_css_selector" };
      }
      scoped.push(`${selectors.map((selector) => `${scope}${selector}, ${scope} ${selector}`).join(", ")}${declarationText}`);
    }
    return { ok: true, cssText: scoped.join("\n") };
  };
  return scopeRules(rules);
}
