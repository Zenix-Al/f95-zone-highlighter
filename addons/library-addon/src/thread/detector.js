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

function parseVersionFromTitleNode(titleNode) {
  if (!titleNode) return "";

  const textParts = [];
  titleNode.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE && String(node.textContent || "").trim()) {
      textParts.push(String(node.textContent || "").trim());
    }
  });

  let remainingText = textParts.join(" ");
  const authorMatch = remainingText.match(/\[([^\]]+)\]$/);
  if (authorMatch) {
    remainingText = remainingText.substring(0, authorMatch.index).trim();
  }

  const versionMatch = remainingText.match(/\[([^\]]+)\]$/);
  return versionMatch?.[1] ? String(versionMatch[1]).trim() : "";
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

export function isThreadPage() {
  return location.hostname.includes("f95zone.to") && location.pathname.startsWith("/threads/");
}

export function getThreadSnapshot() {
  if (!isThreadPage()) return null;

  const threadId = parseThreadIdFromPath(location.pathname);
  if (!threadId) return null;

  const titleNode = document.querySelector("h1.p-title-value");
  const title = getText("h1.p-title-value") || document.title.replace(/\s*\|\s*F95zone.*$/i, "");
  const prefix = getText("h1.p-title-value a.labelLink") || "";
  const gameVersion = parseVersionFromTitleNode(titleNode);

  return {
    threadId,
    url: `${location.origin}${location.pathname}`,
    title,
    canonicalTitle: String(title || "").trim(),
    titleNormalized: String(title || "")
      .trim()
      .toLowerCase(),
    prefix,
    gameVersion,
    tags: getTags(),
    userStatus: "saved",
    note: "",
    userScore: null,
    pinned: false,
    schemaVersion: 1,
    sourcePage: "thread",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
