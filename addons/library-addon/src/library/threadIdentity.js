const THREAD_ID_PATTERN = /^[1-9]\d{0,19}$/;
const THREAD_PATH_PATTERN = /^\/threads\/(?:.*\.)?(\d+)\/?$/i;

export function normalizeF95ThreadId(value) {
  const id = String(value ?? "").trim();
  return THREAD_ID_PATTERN.test(id) ? id : "";
}

export function normalizeF95ThreadUrl(value, threadId = "") {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw, "https://f95zone.to/");
    const host = url.hostname.toLowerCase();
    if (!["http:", "https:"].includes(url.protocol)) return "";
    if (host !== "f95zone.to" && !host.endsWith(".f95zone.to")) return "";
    const urlThreadId = normalizeF95ThreadId(url.pathname.match(THREAD_PATH_PATTERN)?.[1]);
    if (!urlThreadId) return "";
    const expectedId = normalizeF95ThreadId(threadId);
    if (expectedId && urlThreadId !== expectedId) return "";
    return url.href;
  } catch {
    return "";
  }
}

export function validateImportedThreadIdentity(record) {
  const issues = [];
  const threadId = normalizeF95ThreadId(record?.threadId);
  if (!threadId) issues.push({ path: "threadId", code: "invalid_f95_thread_id" });
  const rawUrl = String(record?.thread?.url ?? record?.url ?? "").trim();
  if (rawUrl && !normalizeF95ThreadUrl(rawUrl, threadId)) {
    issues.push({ path: "thread.url", code: "invalid_f95_thread_url" });
  }
  return issues;
}
