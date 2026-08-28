import { safeText } from "./formatters.js";

function compareNumber(left, operator, right) {
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

  const parts = raw.match(/\S+:"[^"]*"|\S+:'[^']*'|"[^"]*"|'[^']*'|\S+/g) || [];
  const textParts = [];
  const tokens = [];
  const valueAfter = (part, offset) => safeText(part.slice(offset))
    .replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, "$1$2")
    .toLowerCase();

  const tokenActions = {
    pinned: () => tokens.push({ type: "pinned", value: true }),
    "is:pinned": () => tokens.push({ type: "pinned", value: true }),
    unpinned: () => tokens.push({ type: "pinned", value: false }),
    "is:unpinned": () => tokens.push({ type: "pinned", value: false }),
    "has:note": () => tokens.push({ type: "hasNote", value: true }),
    note: () => tokens.push({ type: "hasNote", value: true }),
    "has:no-note": () => tokens.push({ type: "hasNote", value: false }),
    nonote: () => tokens.push({ type: "hasNote", value: false }),
    "has:progress": () => tokens.push({ type: "hasProgress", value: true }),
    "has:no-progress": () => tokens.push({ type: "hasProgress", value: false }),
  };

  for (const part of parts) {
    const token = part.toLowerCase();

    if (tokenActions[token]) {
      tokenActions[token]();
      continue;
    }

    if (token.startsWith("status:")) {
      const value = valueAfter(part, 7);
      if (value) tokens.push({ type: "status", value });
      continue;
    }

    if (token.startsWith("tag:")) {
      const value = valueAfter(part, 4);
      if (value) tokens.push({ type: "tag", value });
      continue;
    }

    if (token.startsWith("id:")) {
      const value = valueAfter(part, 3);
      if (value) tokens.push({ type: "id", value });
      continue;
    }

    for (const [prefix, type] of [["rating", "rating"], ["score", "rating"], ["public-rating", "publicRating"]]) {
      const match = token.match(new RegExp(`^${prefix}(<=|>=|=|<|>)(\\d+(?:\\.\\d+)?)$`));
      if (!match) continue;
      tokens.push({
        type,
        operator: match[1],
        value: Number(match[2]),
      });
      break;
    }
    if (["rating", "score", "public-rating"].some((prefix) => token.startsWith(prefix) && /[<>=]/.test(token))) {
      continue;
    }

    for (const [prefix, type] of [["developer:", "developer"], ["version:", "version"], ["prefix:", "prefix"], ["update:", "updateState"], ["check:", "checkStatus"]]) {
      if (!token.startsWith(prefix)) continue;
      const value = valueAfter(part, prefix.length);
      if (value) tokens.push({ type, value });
      break;
    }
    if (["developer:", "version:", "prefix:", "update:", "check:"].some((prefix) => token.startsWith(prefix))) continue;

    textParts.push(valueAfter(part, 0));
  }

  return {
    text: textParts.join(" "),
    tokens,
  };
}

export function matchesSearchTokens(entry, tokens = []) {
  if (!Array.isArray(tokens) || tokens.length === 0) return true;

  const tags = Array.isArray(entry?.thread?.tags)
    ? entry.thread.tags.map((tag) => safeText(tag).toLowerCase())
    : [];
  const status = safeText(entry?.personal?.status).toLowerCase();
  const threadId = safeText(entry?.threadId).toLowerCase();
  const note = safeText(entry?.personal?.note);
  const progress = safeText(entry?.personal?.progressNote);
  const rating = Number(entry?.personal?.rating);
  const publicRating = Number(entry?.thread?.threadRating);
  const developer = safeText(entry?.thread?.developer).toLowerCase();
  const version = safeText(entry?.thread?.currentVersion).toLowerCase();
  const prefixes = Array.isArray(entry?.thread?.prefixes)
    ? entry.thread.prefixes.map((item) => safeText(item?.label).toLowerCase())
    : [];
  const updateState = safeText(entry?.updateState).toLowerCase();
  const checkStatus = safeText(entry?.updateCheck?.status).toLowerCase();

  for (const token of tokens) {
    switch (token.type) {
      case "pinned":
        if (Boolean(entry?.personal?.pinned) !== Boolean(token.value)) return false;
        break;
      case "hasNote": {
        const hasNote = note.length > 0;
        if (hasNote !== Boolean(token.value)) return false;
        break;
      }
      case "hasProgress":
        if (Boolean(progress) !== Boolean(token.value)) return false;
        break;
      case "status":
        if (status !== token.value) return false;
        break;
      case "tag":
        if (!tags.some((tag) => tag.includes(token.value))) return false;
        break;
      case "id":
        if (!threadId.includes(token.value)) return false;
        break;
      case "rating":
        if (!compareNumber(rating, token.operator, token.value)) return false;
        break;
      case "publicRating":
        if (!compareNumber(publicRating, token.operator, token.value)) return false;
        break;
      case "developer":
        if (!developer.includes(token.value)) return false;
        break;
      case "version":
        if (!version.includes(token.value)) return false;
        break;
      case "prefix":
        if (!prefixes.some((prefix) => prefix.includes(token.value))) return false;
        break;
      case "updateState":
        if (updateState !== token.value) return false;
        break;
      case "checkStatus":
        if (checkStatus !== token.value) return false;
        break;
      default:
        break;
    }
  }

  return true;
}
