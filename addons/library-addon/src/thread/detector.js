function parseThreadIdFromPath(pathname) {
  const fromDot = String(pathname || "").match(/\.(\d+)(?:\/?|$)/);
  if (fromDot?.[1]) return fromDot[1];

  const fromThreads = String(pathname || "").match(/\/threads\/(\d+)(?:\/?|$)/);
  if (fromThreads?.[1]) return fromThreads[1];

  return "";
}

function getText(selector) {
  const node = document.querySelector(selector);
  return String(node?.textContent || "").trim();
}

function getPlainTitleTextFromTitleNode(titleNode) {
  if (!titleNode) return "";

  const textParts = [];
  titleNode.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = String(node.textContent || "").trim();
      if (text) textParts.push(text);
    }
  });

  return textParts.join(" ").replace(/\s+/g, " ").trim();
}

function parseBracketSuffixParts(text, { limit = 3 } = {}) {
  const parts = [];
  let remaining = String(text || "").trim();

  while (parts.length < limit) {
    const match = remaining.match(/\[([^\]]+)\]\s*$/);
    if (!match?.[1]) break;
    parts.push(String(match[1]).trim());
    remaining = remaining.slice(0, match.index).trim();
  }

  return { parts, remaining };
}

function parseTitlePrefixes(titleNode) {
  if (!titleNode) return [];

  const seen = new Set();
  const prefixes = [];

  titleNode.querySelectorAll("a.labelLink span").forEach((node) => {
    const label = String(node?.textContent || "").trim();
    if (!label) return;
    const key = label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    const classList = [...(node.classList || [])];
    const colorClass =
      classList.find((cls) => cls.startsWith("label--")) ||
      classList.find((cls) => cls.startsWith("pre-")) ||
      "";
    const color = colorClass ? colorClass.replace(/^(label--|pre-)/, "") : "";

    prefixes.push({ label, color });
  });

  return prefixes;
}

function getTags() {
  const selectors = ["a.tagItem", ".js-tagList a[href*='/tags/']", "a[href*='/tags/']"];

  const values = new Set();
  selectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((node) => {
      const text = String(node?.textContent || "")
        .trim()
        .toLowerCase();
      if (text) values.add(text);
    });
  });
  return [...values];
}

function parseThreadRating() {
  const node = document.querySelector('select[name="rating"][data-initial-rating]');
  const raw = String(node?.getAttribute?.("data-initial-rating") || "").trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function isThreadPage() {
  return location.hostname.includes("f95zone.to") && location.pathname.startsWith("/threads/");
}

export function getThreadSnapshot() {
  if (!isThreadPage()) return null;

  const threadId = parseThreadIdFromPath(location.pathname);
  if (!threadId) return null;

  const titleNode = document.querySelector("h1.p-title-value");
  const titleText =
    getPlainTitleTextFromTitleNode(titleNode) ||
    document.title.replace(/\s*\|\s*F95zone.*$/i, "").trim();
  const prefixes = parseTitlePrefixes(titleNode);
  const { parts: bracketParts } = parseBracketSuffixParts(titleText, { limit: 2 });
  const developer = bracketParts[0] || "";
  const gameVersion = bracketParts[1] || "";

  const title = titleText
    .replace(/\s*\[(v[\d.]+\|?.*?)\]/gi, "") // remove version brackets
    .replace(/\s*\[([^\]]+)\]\s*$/gi, "") // remove last bracket (usually dev)
    .trim();
  const prefix = prefixes[0]?.label ? String(prefixes[0].label).trim() : "";

  return {
    threadId,
    url: `${location.origin}${location.pathname}`,
    title,
    canonicalTitle: String(title || "").trim(),
    titleNormalized: String(title || "")
      .trim()
      .toLowerCase(),
    prefix,
    prefixes,
    gameVersion,
    developer,
    threadRating: parseThreadRating(),
    tags: getTags(),
    userStatus: "saved",
    note: "",
    userScore: null,
    pinned: false,
    schemaVersion: 3,
    sourcePage: "thread",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
