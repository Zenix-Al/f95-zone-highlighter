import { config } from "../../config.js";
import { EXPORTABLE_CONFIG_KEYS } from "./constants.js";
import { deepCloneJson, isPlainObject } from "./helpers.js";

export function buildExportPayload() {
  const payload = {};
  for (const key of EXPORTABLE_CONFIG_KEYS) {
    payload[key] = deepCloneJson(config[key]);
  }
  return payload;
}

export function normalizeImportRoot(parsed) {
  const source = isPlainObject(parsed?.settings) ? parsed.settings : parsed;
  if (!isPlainObject(source)) return source;

  const normalized = deepCloneJson(source);

  const toPositiveInt = (value) => {
    if (Number.isInteger(value) && value > 0) return value;
    if (typeof value === "string" && /^\d+$/.test(value.trim())) {
      const parsedValue = Number.parseInt(value.trim(), 10);
      return parsedValue > 0 ? parsedValue : null;
    }
    return null;
  };

  const normalizeTagEntry = (entry) => {
    if (!isPlainObject(entry)) return null;

    const idCandidate = toPositiveInt(entry.id);
    const nameCandidate = typeof entry.name === "string" ? entry.name.trim() : "";
    if (idCandidate && nameCandidate) {
      return { id: idCandidate, name: nameCandidate };
    }

    const pairs = Object.entries(entry);
    if (pairs.length === 1) {
      const [k, v] = pairs[0];
      const inferredIdFromValue = toPositiveInt(v);
      const inferredNameFromKey = String(k || "").trim();
      if (inferredIdFromValue && inferredNameFromKey) {
        return { id: inferredIdFromValue, name: inferredNameFromKey };
      }

      const inferredIdFromKey = toPositiveInt(k);
      const inferredNameFromValue = typeof v === "string" ? v.trim() : "";
      if (inferredIdFromKey && inferredNameFromValue) {
        return { id: inferredIdFromKey, name: inferredNameFromValue };
      }
    }

    return null;
  };

  const normalizeTagsArray = (tags) => {
    if (!Array.isArray(tags)) {
      if (!isPlainObject(tags)) return tags;
      tags = Object.entries(tags).map(([name, idLike]) => ({ [name]: idLike }));
    }
    const seen = new Set();
    const next = [];
    for (const item of tags) {
      const normalizedEntry = normalizeTagEntry(item);
      if (!normalizedEntry) continue;
      if (seen.has(normalizedEntry.id)) continue;
      seen.add(normalizedEntry.id);
      next.push(normalizedEntry);
    }
    return next;
  };

  const normalizeIdArray = (ids) => {
    if (!Array.isArray(ids)) {
      if (!isPlainObject(ids)) return ids;
      ids = Object.values(ids);
    }
    const seen = new Set();
    const next = [];
    for (const item of ids) {
      const normalizedId = toPositiveInt(item);
      if (!normalizedId) continue;
      if (seen.has(normalizedId)) continue;
      seen.add(normalizedId);
      next.push(normalizedId);
    }
    return next;
  };

  if (Object.prototype.hasOwnProperty.call(normalized, "tags")) {
    normalized.tags = normalizeTagsArray(normalized.tags);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "preferredTags")) {
    normalized.preferredTags = normalizeIdArray(normalized.preferredTags);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "excludedTags")) {
    normalized.excludedTags = normalizeIdArray(normalized.excludedTags);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "markedTags")) {
    normalized.markedTags = normalizeIdArray(normalized.markedTags);
  }

  return normalized;
}

export function formatDateForFilename(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function downloadJsonFile(filename, text) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function pickJsonFile() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.style.display = "none";
    document.body.appendChild(input);

    let settled = false;
    const finish = (file) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file || null);
    };

    input.addEventListener(
      "change",
      () => {
        finish(input.files?.[0] || null);
      },
      { once: true },
    );

    window.addEventListener(
      "focus",
      () => {
        // If user cancels file picker, "change" may not fire in some browsers.
        setTimeout(() => finish(input.files?.[0] || null), 300);
      },
      { once: true },
    );

    input.click();
  });
}
