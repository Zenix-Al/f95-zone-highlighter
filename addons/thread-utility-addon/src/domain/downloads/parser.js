const DOWNLOAD_LIMIT = 100;

function text(value, limit = 120) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function safeUrl(value, baseUrl) {
  try {
    const url = new URL(String(value || ""), baseUrl);
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function resolverBeside(anchor) {
  for (const node of [anchor.nextElementSibling, anchor.previousElementSibling]) {
    if (node?.matches?.('button[data-addon-id="masked-direct-addon"][data-action-type]')) {
      return node;
    }
  }
  return null;
}

function downloadBoundary(root) {
  return [...root.querySelectorAll("b, strong, h1, h2, h3, h4, h5, h6")]
    .find((node) => /^(?:download|downloads)$/i.test(text(node.textContent).replace(/:$/, "")))
    || null;
}

function follows(node, boundary) {
  if (!boundary) return false;
  return Boolean(boundary.compareDocumentPosition(node) & 4);
}

function platformFor(anchor) {
  const parent = anchor.parentElement;
  const labels = parent
    ? [...parent.querySelectorAll("b, strong")].filter((node) => follows(anchor, node))
    : [];
  const label = text(labels.at(-1)?.textContent).replace(/:$/, "").toLowerCase();
  if (/win(?:dows)?/.test(label)) return "Windows";
  if (/linux/.test(label)) return "Linux";
  if (/mac|osx/.test(label)) return "Mac";
  if (/android/.test(label)) return "Android";
  return "Other";
}

export function parseDownloads(root, {
  baseUrl = root?.ownerDocument?.baseURI || "",
  sourceRegistry,
} = {}) {
  if (!root?.querySelectorAll) return Object.freeze([]);
  const boundary = downloadBoundary(root);
  const seen = new Set();
  const downloads = [];
  for (const anchor of root.querySelectorAll("a[href]")) {
    if (downloads.length >= DOWNLOAD_LIMIT) break;
    if (anchor.matches(".js-lbImage") || anchor.querySelector("img")) continue;
    const resolver = resolverBeside(anchor);
    if (boundary ? !follows(anchor, boundary) : !resolver) continue;
    const url = safeUrl(anchor.getAttribute("href"), baseUrl);
    if (!url || seen.has(url.href)) continue;
    seen.add(url.href);
    const actionType = String(resolver?.dataset?.actionType || "");
    const expectedUrl = actionType === "direct"
      ? resolver?.dataset?.directHref
      : resolver?.dataset?.maskedHref;
    const matchesResolver = resolver && safeUrl(expectedUrl, baseUrl)?.href === url.href;
    const id = `download-${downloads.length + 1}`;
    downloads.push(Object.freeze({
      id,
      label: text(anchor.textContent) || url.hostname,
      platform: platformFor(anchor),
      host: url.hostname.slice(0, 120),
      originalUrl: url.href.slice(0, 1024),
      kind: actionType === "direct"
        ? "direct"
        : url.pathname.startsWith("/masked/") || actionType === "masked"
          ? "masked"
          : "unknown",
      anchorToken: sourceRegistry?.retain(anchor, "download-anchor") || "",
      maskedDirectToken: matchesResolver
        ? sourceRegistry?.retain(resolver, "masked-direct-button") || ""
        : "",
      actionType: matchesResolver ? actionType : "",
    }));
  }
  return Object.freeze(downloads);
}

export { DOWNLOAD_LIMIT };
