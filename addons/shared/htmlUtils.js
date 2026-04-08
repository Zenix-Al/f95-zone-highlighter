/**
 * Shared HTML utilities for F95UE add-ons.
 * Deliberately minimal — each add-on's renderer builds on top of these.
 */

export function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function normalizeText(value) {
  return String(value || "").trim();
}
