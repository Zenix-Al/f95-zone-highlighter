export function prioritizeCurrentThreadRow(rows = [], liveThreadId = "") {
  const id = String(liveThreadId || "").trim();
  const entries = Array.isArray(rows) ? rows : [];
  if (!id) return entries;

  const priorityIndex = entries.findIndex(
    (entry) => String(entry?.threadId || "").trim() === id,
  );
  if (priorityIndex < 1) return entries;
  return [entries[priorityIndex], ...entries.slice(0, priorityIndex), ...entries.slice(priorityIndex + 1)];
}

export function matchesCurrentThreadPriorityFilters(record, { search = "", status = "all", matchesRecord } = {}) {
  const expectedStatus = String(status || "all").trim().toLowerCase();
  if (
    expectedStatus &&
    expectedStatus !== "all" &&
    String(record?.personal?.status || "").trim().toLowerCase() !== expectedStatus
  ) {
    return false;
  }

  if (typeof matchesRecord === "function" && !matchesRecord(record)) return false;

  const query = String(search || "").trim().toLowerCase();
  if (!query) return true;
  const haystack = [
    record?.thread?.title,
    record?.thread?.canonicalTitle,
    ...(Array.isArray(record?.thread?.prefixes)
      ? record.thread.prefixes.map((item) => item?.label)
      : []),
    record?.thread?.currentVersion,
    record?.thread?.developer,
    record?.thread?.threadRating,
    record?.thread?.url,
    ...(Array.isArray(record?.thread?.tags) ? record.thread.tags : []),
    record?.threadId,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  return haystack.includes(query);
}
