import { LATEST_SEARCH_ROWS } from "./latestListingSelector.js";
import { normalizeVersionIdentity } from "./updateEventModel.js";

const SEARCH_LIMIT = 30;
const isStopword = (word) => /^(?:a|an|the|of|no|not|on|in|and|to|with|was)$/i.test(word);

// Conservative query heuristics observed on Latest, not a claimed server contract.
// Never use this lossy search text as the saved title/developer or record identity.
function limitQuery(text) {
  const words = text.split(/\s+/)
    .filter((word) => word && !isStopword(word));
  const result = [];
  for (const word of words) {
    if ([...result, word].join(" ").length > SEARCH_LIMIT) break;
    result.push(word);
  }
  // Check again after limiting: never leave an observed problem word at the end.
  return result.filter((word) => !isStopword(word)).join(" ");
}

export function sanitizeLatestTitleQuery(value) {
  const text = String(value || "").normalize("NFKC")
    .replace(/['’]s\b/gi, "")
    .replace(/[^a-z0-9\s]/gi, " ");
  return limitQuery(text);
}

export function sanitizeLatestCreatorQuery(value) {
  // Choose one contiguous name fragment; never stitch pieces across separators.
  // Longest usable candidate wins; ties preserve the original order. Underscores
  // are retained because creator searches accept names such as Under_Formatman.
  return String(value || "").normalize("NFKC").split(/[^a-z0-9_\s]+/i)
    .map((candidate) => limitQuery(candidate))
    .filter(Boolean).sort((left, right) => right.length - left.length)[0] || "";
}

// Compatibility export for existing title-query callers.
export const sanitizeLatestQuery = sanitizeLatestTitleQuery;

export function getLatestSearchTitle(title, version = "") {
  const saved = String(title || "").trim();
  const suffix = saved.match(/\[([^\]]+)\]\s*$/);
  return suffix && version && normalizeVersionIdentity(suffix[1]) === normalizeVersionIdentity(version)
    ? saved.slice(0, suffix.index).trim() : saved;
}
export function selectUpdateSource(config = {}) {
  return {
    source: config.preferLatestApi === true ? "hybrid" : "thread-html",
    reason: config.preferLatestApi === true ? "api_preferred" : "html_only",
  };
}

export function createLatestSearchUrl(title, creator = "", { version = "", now = Date.now } = {}) {
  const search = sanitizeLatestTitleQuery(getLatestSearchTitle(title, version));
  if (!search) return ""; // Never request the unfiltered default list.
  const developer = sanitizeLatestCreatorQuery(creator);
  const url = new URL("https://f95zone.to/sam/latest_alpha/latest_data.php");
  url.search = new URLSearchParams({
    cmd: "list", cat: "games", page: "1", search,
    sort: "date", rows: String(LATEST_SEARCH_ROWS),
    ...(developer ? { creator: developer } : {}),
    _: String(now()),
  }).toString();
  return url.href.replaceAll("+", "%20");
}
