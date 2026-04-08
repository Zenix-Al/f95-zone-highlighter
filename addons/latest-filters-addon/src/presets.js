/**
 * Preset data layer for Latest Filters Add-on.
 *
 * Single responsibility: URL normalization and preset record shape.
 * No DOM access, no storage access, no module-level state.
 */

import { normalizeText } from "../../shared/htmlUtils.js";

const LATEST_HOSTNAME = "f95zone.to";
const LATEST_PATH = "/sam/latest_alpha";

// ─── Page detection ───────────────────────────────────────────────────────────

export function isLatestPage() {
  return location.hostname.includes(LATEST_HOSTNAME) && location.pathname.startsWith(LATEST_PATH);
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

function prettifyKey(key) {
  return String(key || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseHashSegments(rawHash) {
  const hash = String(rawHash || "").trim();
  if (!hash) return [];

  const normalized = hash.replace(/^#\/?/, "");
  if (!normalized) return [];

  return normalized
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const eqIndex = segment.indexOf("=");
      if (eqIndex < 0) return { key: segment.toLowerCase(), value: "" };
      const key = segment.slice(0, eqIndex).trim().toLowerCase();
      const value = segment.slice(eqIndex + 1).trim();
      return { key, value };
    });
}

function buildNormalizedHash(rawHash) {
  const segments = parseHashSegments(rawHash).filter((entry) => entry.key && entry.key !== "page");
  if (segments.length === 0) return "";

  const sorted = [...segments].sort((left, right) => {
    const keyCompare = left.key.localeCompare(right.key);
    if (keyCompare !== 0) return keyCompare;
    return String(left.value || "").localeCompare(String(right.value || ""));
  });

  const encoded = sorted
    .map((entry) => (entry.value ? `${entry.key}=${entry.value}` : entry.key))
    .join("/");
  return encoded ? `#/${encoded}` : "";
}

/**
 * Returns a canonical Latest Updates URL (no hash, no page param, params sorted
 * alphabetically) for reliable equality comparisons, or "" if the URL is not a
 * Latest Updates URL.
 */
export function normalizeLatestUrl(rawUrl) {
  try {
    const url = new URL(rawUrl, location.origin);
    if (!url.hostname.includes(LATEST_HOSTNAME) || !url.pathname.startsWith(LATEST_PATH)) {
      return "";
    }

    url.hash = "";
    url.searchParams.delete("page");

    const entries = [...url.searchParams.entries()].sort((left, right) => {
      const keyCompare = left[0].localeCompare(right[0]);
      if (keyCompare !== 0) return keyCompare;
      return left[1].localeCompare(right[1]);
    });

    const sorted = new URLSearchParams();
    for (const [key, value] of entries) sorted.append(key, value);

    const search = sorted.toString();
    const normalizedHash = buildNormalizedHash(
      rawUrl instanceof URL ? rawUrl.hash : new URL(rawUrl, location.origin).hash,
    );
    return `${url.origin}${url.pathname}${search ? `?${search}` : ""}${normalizedHash}`;
  } catch {
    return "";
  }
}

/** Returns a human-readable filter description for the given Latest Updates URL. */
export function summarizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl, location.origin);
    const grouped = new Map();

    url.searchParams.forEach((value, key) => {
      if (key === "page") return;
      const existing = grouped.get(key) || [];
      existing.push(value);
      grouped.set(key, existing);
    });

    const items = [];
    for (const [key, values] of grouped.entries()) {
      const label = prettifyKey(key);
      const joined = values
        .map((v) => decodeURIComponent(String(v || "")).replace(/\+/g, " "))
        .filter(Boolean)
        .join(", ");
      items.push(joined ? `${label}: ${joined}` : label);
    }

    const hashSegments = parseHashSegments(url.hash).filter(
      (entry) => entry.key && entry.key !== "page",
    );
    for (const segment of hashSegments) {
      const label = prettifyKey(segment.key);
      if (!segment.value) {
        items.push(label);
        continue;
      }
      const values = String(segment.value)
        .split(",")
        .map((v) => decodeURIComponent(v).replace(/\+/g, " ").trim())
        .filter(Boolean);
      items.push(values.length > 0 ? `${label}: ${values.join(", ")}` : label);
    }

    return items.length > 0 ? items.join(" | ") : "Base latest page";
  } catch {
    return "Base latest page";
  }
}

// ─── Preset normalization ─────────────────────────────────────────────────────

export function makePresetId() {
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Normalizes a raw storage record into a canonical preset shape.
 * Returns null if the record has no valid Latest Updates URL.
 */
export function normalizePreset(record, index = 0) {
  const url = normalizeText(record?.url);
  const normalizedUrl = normalizeLatestUrl(url);
  if (!normalizedUrl) return null;

  const name = normalizeText(record?.name) || `Saved Filter ${index + 1}`;
  const updatedAt = Number(record?.updatedAt) || Date.now();
  const summary = summarizeUrl(url);
  const searchText = [name, summary, normalizedUrl].join(" ").toLowerCase();

  return {
    id: normalizeText(record?.id) || makePresetId(),
    name,
    url,
    normalizedUrl,
    summary,
    searchText,
    updatedAt,
  };
}

/** Normalizes and sorts an array of raw preset records, dropping invalid entries. */
export function normalizePresets(records) {
  const source = Array.isArray(records) ? records : [];
  return source
    .map((record, index) => normalizePreset(record, index))
    .filter(Boolean)
    .sort((left, right) => right.updatedAt - left.updatedAt || left.name.localeCompare(right.name));
}
