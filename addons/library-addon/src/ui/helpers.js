/**
 * Utility functions and helpers
 * Pure functions for formatting, validation, filtering, and data transformation
 */

export function fmtDate(ts) {
  const value = Number(ts || 0);
  if (!Number.isFinite(value) || value <= 0) return "-";
  return new Date(value).toLocaleString();
}

export function safeText(value) {
  return String(value || "").trim();
}

export function buildTagConfig({
  tags = [],
  preferredTags = [],
  excludedTags = [],
  markedTags = [],
  color = {},
} = {}) {
  const byNameLower = new Map();
  (Array.isArray(tags) ? tags : []).forEach((tag) => {
    const id = Number(tag?.id);
    const name = safeText(tag?.name);
    if (!Number.isFinite(id) || !name) return;
    byNameLower.set(name.toLowerCase(), id);
  });

  const toIdSet = (value) =>
    new Set((Array.isArray(value) ? value : []).map((x) => Number(x)).filter(Number.isFinite));

  const preferred = toIdSet(preferredTags);
  const excluded = toIdSet(excludedTags);
  const marked = toIdSet(markedTags);

  const palette = color && typeof color === "object" ? color : {};
  return { byNameLower, preferred, excluded, marked, palette };
}

export function buildTagChipItems(tagNames, tagConfig) {
  const list = Array.isArray(tagNames) ? tagNames : [];
  const cfg = tagConfig && typeof tagConfig === "object" ? tagConfig : null;

  const items = list
    .map((nameRaw) => safeText(nameRaw))
    .filter(Boolean)
    .map((name) => {
      const key = name.toLowerCase();
      const id = cfg?.byNameLower?.get(key);

      let state = "";
      if (Number.isFinite(id)) {
        if (cfg.preferred?.has(id)) state = "preferred";
        else if (cfg.excluded?.has(id)) state = "excluded";
        else if (cfg.marked?.has(id)) state = "marked";
      }

      const palette = cfg?.palette || {};
      const bg =
        state === "preferred"
          ? safeText(palette.preferred)
          : state === "excluded"
            ? safeText(palette.excluded)
            : state === "marked"
              ? safeText(palette.marked)
              : "";
      const fg =
        state === "preferred"
          ? safeText(palette.preferredText)
          : state === "excluded"
            ? safeText(palette.excludedText)
            : state === "marked"
              ? safeText(palette.markedText)
              : "";

      return {
        label: name,
        state,
        bg,
        fg,
      };
    });

  const weight = (item) => {
    if (item.state === "preferred") return 0;
    if (item.state === "excluded") return 1;
    if (item.state === "marked") return 2;
    return 3;
  };

  items.sort((a, b) => {
    const wa = weight(a);
    const wb = weight(b);
    if (wa !== wb) return wa - wb;
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  });

  return items;
}

export function compareNumber(left, operator, right) {
  if (!Number.isFinite(left)) return false;
  if (operator === ">") return left > right;
  if (operator === ">=") return left >= right;
  if (operator === "<") return left < right;
  if (operator === "<=") return left <= right;
  return left === right;
}

export function parseSearchQuery(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return { text: "", tokens: [] };

  const parts = raw.split(/\s+/).filter(Boolean);
  const textParts = [];
  const tokens = [];

  const tokenActions = {
    pinned: () => tokens.push({ type: "pinned", value: true }),
    "is:pinned": () => tokens.push({ type: "pinned", value: true }),
    unpinned: () => tokens.push({ type: "pinned", value: false }),
    "is:unpinned": () => tokens.push({ type: "pinned", value: false }),
    "has:note": () => tokens.push({ type: "hasNote", value: true }),
    note: () => tokens.push({ type: "hasNote", value: true }),
    "has:no-note": () => tokens.push({ type: "hasNote", value: false }),
    nonote: () => tokens.push({ type: "hasNote", value: false }),
  };

  for (const part of parts) {
    const token = part.toLowerCase();

    // Handle direct token matches
    if (tokenActions[token]) {
      tokenActions[token]();
      continue;
    }

    // Handle prefix-based tokens
    if (token.startsWith("status:")) {
      const value = safeText(token.slice(7));
      if (value) tokens.push({ type: "status", value });
      continue;
    } else if (token.startsWith("tag:")) {
      const value = safeText(token.slice(4));
      if (value) tokens.push({ type: "tag", value });
      continue;
    } else if (token.startsWith("id:")) {
      const value = safeText(token.slice(3));
      if (value) tokens.push({ type: "id", value });
      continue;
    } else {
      // Handle score conditions
      const scoreMatch = token.match(/^score(<=|>=|=|<|>)(\d+(?:\.\d+)?)$/);
      if (scoreMatch) {
        tokens.push({
          type: "score",
          operator: scoreMatch[1],
          value: Number(scoreMatch[2]),
        });
        continue;
      }
    }

    textParts.push(part);
  }

  return {
    text: textParts.join(" "),
    tokens,
  };
}

export function matchesSearchTokens(entry, tokens = []) {
  if (!Array.isArray(tokens) || tokens.length === 0) return true;

  const tags = Array.isArray(entry?.tags)
    ? entry.tags.map((tag) => safeText(tag).toLowerCase())
    : [];
  const status = safeText(entry?.userStatus).toLowerCase();
  const threadId = safeText(entry?.threadId).toLowerCase();
  const note = safeText(entry?.note);
  const score = Number(entry?.userScore);

  for (const token of tokens) {
    switch (token.type) {
      case "pinned":
        if (Boolean(entry?.pinned) !== Boolean(token.value)) return false;
        break;
      case "hasNote": {
        const hasNote = note.length > 0;
        if (hasNote !== Boolean(token.value)) return false;
        break;
      }
      case "status":
        if (status !== token.value) return false;
        break;
      case "tag":
        if (!tags.some((tag) => tag.includes(token.value))) return false;
        break;
      case "id":
        if (!threadId.includes(token.value)) return false;
        break;
      case "score":
        if (!compareNumber(score, token.operator, token.value)) return false;
        break;
      default:
        break;
    }
  }

  return true;
}

export function triggerJsonDownload(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function getThreadDiffSummary(entry, snapshot) {
  if (!entry || !snapshot || snapshot.threadId !== entry.threadId) {
    return { changed: false, fields: [] };
  }

  const fields = [];
  if (safeText(entry.title) !== safeText(snapshot.title)) fields.push("title");
  if (safeText(entry.prefix) !== safeText(snapshot.prefix)) fields.push("prefix");

  const leftPrefixes = Array.isArray(entry.prefixes)
    ? entry.prefixes
        .map((p) => safeText(p?.label).toLowerCase())
        .filter(Boolean)
        .join("|")
    : "";
  const rightPrefixes = Array.isArray(snapshot.prefixes)
    ? snapshot.prefixes
        .map((p) => safeText(p?.label).toLowerCase())
        .filter(Boolean)
        .join("|")
    : "";
  if (leftPrefixes !== rightPrefixes) fields.push("prefixes");

  if (safeText(entry.gameVersion) !== safeText(snapshot.gameVersion)) fields.push("version");
  if (safeText(entry.developer) !== safeText(snapshot.developer)) fields.push("developer");
  if (Number(entry.threadRating ?? null) !== Number(snapshot.threadRating ?? null)) fields.push("rating");
  if (safeText(entry.url) !== safeText(snapshot.url)) fields.push("url");

  const leftTags = Array.isArray(entry.tags)
    ? entry.tags.map((tag) => safeText(tag)).filter(Boolean)
    : [];
  const rightTags = Array.isArray(snapshot.tags)
    ? snapshot.tags.map((tag) => safeText(tag).toLowerCase()).filter(Boolean)
    : [];
  if (leftTags.join("|") !== rightTags.join("|")) fields.push("tags");

  return {
    changed: fields.length > 0,
    fields,
  };
}
