const CONTENT_LIMITS = Object.freeze({
  nodes: 400,
  text: 12000,
});

const SECTION_ALIASES = Object.freeze({
  description: new Set(["description", "overview"]),
  installation: new Set(["installation", "how to install"]),
});

const BOUNDARY_LABELS = new Set([
  "thread updated",
  "release date",
  "developer",
  "version",
  "vndb",
  "wiki",
  "other games",
  "genre",
  "genres",
  "tags",
  "download",
  "downloads",
  "changelog",
  "changelogs",
  "developer note",
  "developer notes",
  "feature",
  "features",
]);

const ALLOWED_TAGS = new Map([
  ["P", "p"],
  ["BR", "br"],
  ["UL", "ul"],
  ["OL", "ol"],
  ["LI", "li"],
  ["B", "strong"],
  ["STRONG", "strong"],
  ["I", "em"],
  ["EM", "em"],
  ["A", "a"],
]);

const BLOCKED_TAGS = new Set([
  "BUTTON",
  "IMG",
  "VIDEO",
  "AUDIO",
  "SOURCE",
  "PICTURE",
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "SVG",
  "CANVAS",
  "FORM",
  "INPUT",
  "TEXTAREA",
  "SELECT",
]);

function normalizedLabel(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/:$/, "")
    .trim()
    .toLowerCase()
    .slice(0, 80);
}

function sectionIdForLabel(label) {
  for (const [id, aliases] of Object.entries(SECTION_ALIASES)) {
    if (aliases.has(label)) return id;
  }
  return null;
}

function markerLabel(element) {
  if (element.matches?.(".bbCodeSpoiler-button")) {
    return normalizedLabel(
      element.getAttribute("title")
      || element.querySelector(".button-text")?.textContent
      || element.textContent,
    );
  }
  return normalizedLabel(element.textContent);
}

function discoverMarkers(root) {
  const markers = [];
  for (const element of root.querySelectorAll(
    "b, strong, h1, h2, h3, h4, h5, h6, .bbCodeSpoiler-button",
  )) {
    const label = markerLabel(element);
    const sectionId = sectionIdForLabel(label);
    if (!sectionId && !BOUNDARY_LABELS.has(label)) continue;
    markers.push({ element, label, sectionId });
  }
  return markers;
}

function spoilerContent(marker) {
  if (!marker.element.matches?.(".bbCodeSpoiler-button")) return null;
  return marker.element
    .closest(".bbCodeSpoiler")
    ?.querySelector(".bbCodeSpoiler-content") || null;
}

function cloneSectionRange(root, markers, markerIndex) {
  const marker = markers[markerIndex];
  const content = spoilerContent(marker);
  const fragment = root.ownerDocument.createDocumentFragment();
  if (content) {
    for (const child of content.childNodes) fragment.appendChild(child.cloneNode(true));
    return fragment;
  }
  const next = markers.slice(markerIndex + 1).find((candidate) =>
    !marker.element.contains(candidate.element));
  let started = false;
  let finished = false;

  function scan(node) {
    if (finished) return;
    if (node === marker.element) {
      started = true;
      return;
    }
    if (node === next?.element) {
      finished = true;
      return;
    }
    if (!started || (next && node.contains?.(next.element))) {
      for (const child of node.childNodes || []) scan(child);
      return;
    }
    fragment.appendChild(node.cloneNode(true));
  }

  for (const child of root.childNodes) scan(child);
  return fragment;
}

function safeHref(value, baseUrl) {
  try {
    const url = new URL(String(value || ""), baseUrl);
    return ["http:", "https:"].includes(url.protocol) ? url.href.slice(0, 1024) : "";
  } catch {
    return "";
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeFragment(fragment, baseUrl) {
  let nodeCount = 0;
  let textLength = 0;
  let truncated = false;
  const textParts = [];

  function visit(node) {
    if (truncated) return "";
    if (node.nodeType === 3) {
      const remaining = CONTENT_LIMITS.text - textLength;
      if (remaining <= 0) {
        truncated = true;
        return "";
      }
      const normalizedText = String(node.textContent || "").replace(/\s+/g, " ");
      const text = normalizedText.slice(0, remaining);
      textLength += text.length;
      if (text.trim()) textParts.push(text.trim());
      if (normalizedText.length > text.length) truncated = true;
      return escapeHtml(text);
    }
    if (node.nodeType !== 1 && node.nodeType !== 11) return "";
    if (node.nodeType === 1) {
      nodeCount += 1;
      if (nodeCount > CONTENT_LIMITS.nodes) {
        truncated = true;
        return "";
      }
      if (
        BLOCKED_TAGS.has(node.tagName)
        || node.matches?.(".js-lbImage, .f95ue-addon-resolve-btn, [data-xf-click='toggle']")
      ) {
        return "";
      }
    }
    const children = [...node.childNodes].map(visit).join("");
    if (node.nodeType === 11) return children;
    const allowed = ALLOWED_TAGS.get(node.tagName);
    if (!allowed) return children;
    if (allowed === "br") {
      textParts.push("\n");
      return "<br>";
    }
    if (allowed === "a") {
      const href = safeHref(node.getAttribute("href"), baseUrl);
      return href
        ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${children}</a>`
        : children;
    }
    return `<${allowed}>${children}</${allowed}>`;
  }

  const html = visit(fragment);
  return Object.freeze({
    html,
    nodeCount: Math.min(nodeCount, CONTENT_LIMITS.nodes),
    text: textParts.join(" ").replace(/\s*\n\s*/g, "\n").replace(/[ \t]+/g, " ").trim(),
    truncated,
  });
}

function unavailableSection(id) {
  return Object.freeze({
    id,
    available: false,
    html: "",
    text: "",
    nodeCount: 0,
    truncated: false,
  });
}

export function parseContentSections(root, { baseUrl = root?.ownerDocument?.baseURI || "" } = {}) {
  if (!root?.querySelectorAll) {
    return Object.freeze({
      description: unavailableSection("description"),
      installation: unavailableSection("installation"),
    });
  }
  const markers = discoverMarkers(root);
  const result = {};
  for (const id of ["description", "installation"]) {
    const markerIndex = markers.findIndex((marker) => marker.sectionId === id);
    if (markerIndex < 0) {
      result[id] = unavailableSection(id);
      continue;
    }
    const normalized = sanitizeFragment(
      cloneSectionRange(root, markers, markerIndex),
      baseUrl,
    );
    const html = normalized.html.replace(/^(?:(?:\s|&nbsp;)*:(?:\s|&nbsp;)*|(?:\s|&nbsp;)*<br>)+/i, "");
    const text = normalized.text.replace(/^:\s*/, "");
    result[id] = Object.freeze({
      id,
      available: Boolean(text),
      ...normalized,
      html,
      text,
    });
  }
  return Object.freeze(result);
}

export { CONTENT_LIMITS };
