import { SNAPSHOT_LIMITS } from "./limits.js";

function boundedText(value, limit = SNAPSHOT_LIMITS.text) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function boundedUrl(value) {
  return String(value || "").trim().slice(0, SNAPSHOT_LIMITS.url);
}

function freezeSnapshot(value) {
  Object.freeze(value.starter);
  Object.freeze(value.prefixes);
  Object.freeze(value.tags);
  if (value.sectionSources) Object.freeze(value.sectionSources);
  if (value.downloadSource) Object.freeze(value.downloadSource);
  return Object.freeze(value);
}

function titleParts(document, pageContext) {
  const root = document?.querySelector?.("h1.p-title-value") || null;
  const prefixes = root
    ? [...root.querySelectorAll(".labelLink .label")]
        .slice(0, SNAPSHOT_LIMITS.prefixes)
        .map((node) => boundedText(node.textContent))
        .filter(Boolean)
    : [];

  let title = "";
  if (root) {
    const clone = root.cloneNode(true);
    for (const node of clone.querySelectorAll(".labelLink, .label-append")) node.remove();
    title = boundedText(clone.textContent);
  }
  if (!title) {
    title = boundedText(
      pageContext?.threadTitle
      || String(document?.title || "").replace(/\s*\|\s*F95zone.*$/i, ""),
    );
  }

  const suffixes = [];
  let canonicalTitle = title;
  while (true) {
    const match = canonicalTitle.match(/\s*\[([^\[\]]{1,120})\]\s*$/);
    if (!match) break;
    suffixes.unshift(boundedText(match[1], 120));
    canonicalTitle = canonicalTitle.slice(0, match.index).trim();
  }
  const isVersion = (value) => /^(?:v(?:ersion)?\s*)?\d/i.test(String(value || ""));
  let version = "";
  let developer = "";
  if (suffixes.length >= 2 && isVersion(suffixes.at(-2))) {
    version = suffixes.at(-2);
    developer = suffixes.at(-1);
  } else if (suffixes.length && isVersion(suffixes.at(-1))) {
    version = suffixes.at(-1);
  } else if (suffixes.length) {
    developer = suffixes.at(-1);
  }

  return {
    title,
    canonicalTitle: boundedText(canonicalTitle || title),
    developer,
    prefixes,
    version,
  };
}

function headerTags(document) {
  return [...(document?.querySelectorAll?.(".js-tagList a.tagItem") || [])]
    .slice(0, SNAPSHOT_LIMITS.tags)
    .map((node) => boundedText(node.textContent))
    .filter(Boolean);
}

function ratingValue(document) {
  const raw = String(
    document
      ?.querySelector?.('select[name="rating"][data-initial-rating]')
      ?.getAttribute?.("data-initial-rating")
    || "",
  ).trim();
  if (!raw) return null;
  const rating = Number(raw);
  return Number.isFinite(rating) && rating >= 0 && rating <= 5 ? rating : null;
}

function findStarter(document) {
  const primary = document?.querySelector?.("article.message-threadStarterPost");
  if (primary) return primary;
  const candidates = [...(document?.querySelectorAll?.("article") || [])].slice(0, 20);
  return candidates.find((article) =>
    [...article.querySelectorAll(".message-attribution a")]
      .slice(0, 20)
      .some((anchor) => boundedText(anchor.textContent, 12) === "#1"),
  ) || null;
}

function postIdentity(starter) {
  const contentId = String(starter?.getAttribute?.("data-content") || "");
  const elementId = String(starter?.id || "");
  const postId = (contentId.match(/^post-(\d+)$/i) || elementId.match(/(?:post-)(\d+)$/i))?.[1] || "";
  const time = starter?.querySelector?.(".message-attribution time");
  return {
    postId: boundedText(postId, 64),
    author: boundedText(starter?.getAttribute?.("data-author") || ""),
    postedAt: boundedText(time?.getAttribute?.("datetime") || time?.textContent || "", 120),
  };
}

function characterizeSource(root) {
  if (!root) return { linkCount: 0, nodeCount: 0, truncated: false };
  const walker = root.ownerDocument.createTreeWalker(root);
  let linkCount = root.matches?.("a") ? 1 : 0;
  let nodeCount = 1;
  let truncated = false;
  while (walker.nextNode()) {
    nodeCount += 1;
    if (walker.currentNode?.matches?.("a")) linkCount += 1;
    if (
      nodeCount > SNAPSHOT_LIMITS.sourceNodes
      || linkCount > SNAPSHOT_LIMITS.sourceLinks
    ) {
      truncated = true;
      break;
    }
  }
  return {
    linkCount: Math.min(linkCount, SNAPSHOT_LIMITS.sourceLinks),
    nodeCount: Math.min(nodeCount, SNAPSHOT_LIMITS.sourceNodes),
    truncated,
  };
}

export function captureThreadSnapshot({
  document,
  pageContext,
  generation,
  sourceRegistry,
  capturedAt = Date.now(),
}) {
  const title = titleParts(document, pageContext);
  const starterNode = findStarter(document);
  const contentRoot = starterNode?.querySelector?.(".message-body .bbWrapper") || null;
  const sourceBounds = characterizeSource(contentRoot);
  sourceRegistry.begin(generation);
  const contentRootToken = sourceRegistry.retain(contentRoot, "starter-content");
  const source = contentRootToken
    ? { contentRootToken, ...sourceBounds }
    : null;
  return freezeSnapshot({
    threadId: boundedText(pageContext?.threadId || "", 64),
    url: boundedUrl(pageContext?.url || ""),
    title: title.title,
    canonicalTitle: title.canonicalTitle,
    version: title.version,
    developer: title.developer,
    prefixes: title.prefixes,
    rating: ratingValue(document),
    starter: postIdentity(starterNode),
    tags: headerTags(document),
    sectionSources: source,
    downloadSource: source ? { ...source } : null,
    capturedAt: Math.max(0, Number(capturedAt) || 0),
  });
}
