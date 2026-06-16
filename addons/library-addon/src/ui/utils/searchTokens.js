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

    if (tokenActions[token]) {
      tokenActions[token]();
      continue;
    }

    if (token.startsWith("status:")) {
      const value = safeText(token.slice(7));
      if (value) tokens.push({ type: "status", value });
      continue;
    }

    if (token.startsWith("tag:")) {
      const value = safeText(token.slice(4));
      if (value) tokens.push({ type: "tag", value });
      continue;
    }

    if (token.startsWith("id:")) {
      const value = safeText(token.slice(3));
      if (value) tokens.push({ type: "id", value });
      continue;
    }

    const scoreMatch = token.match(/^score(<=|>=|=|<|>)(\d+(?:\.\d+)?)$/);
    if (scoreMatch) {
      tokens.push({
        type: "score",
        operator: scoreMatch[1],
        value: Number(scoreMatch[2]),
      });
      continue;
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
