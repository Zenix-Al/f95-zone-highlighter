export const THREAD_UTILITY_LIMITS = Object.freeze({
  sourceNodes: 1500,
  normalizedNodes: 400,
  sectionText: 12000,
  sourceLinks: 250,
  downloads: 100,
  tags: 100,
  utilities: 30,
  clipboardText: 4096,
  dialogHtmlBytes: 120 * 1024,
  stylesheetBytes: 60 * 1024,
});

export function byteLength(value) {
  return new TextEncoder().encode(String(value || "")).length;
}
