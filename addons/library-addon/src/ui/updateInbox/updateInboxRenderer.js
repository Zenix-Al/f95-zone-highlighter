import cssTemplate from "./updateInbox.css";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value) {
  const timestamp = Number(value || 0);
  return Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp).toLocaleString()
    : "Unknown";
}

export function getUpdateInboxStyleText(
  rootSelector = ".f95ue-library-update-inbox",
) {
  return cssTemplate.replaceAll("__ROOT__", rootSelector);
}

export function renderUpdateInbox({
  entries = [],
  count = null,
  hasNext = false,
  loading = false,
  busy = false,
  status = "",
} = {}) {
  const countText = Number.isFinite(count)
    ? `${count} unacknowledged update${count === 1 ? "" : "s"}`
    : "Unacknowledged updates";
  const rows = entries
    .map(({ record, previousVersion = "" }) => {
      const id = String(record?.threadId || "");
      const thread = record?.thread || {};
      const detectedAt =
        record?.lastThreadChangeAt ||
        thread.versionObservedAt ||
        record?.recordModifiedAt;
      const versionText = previousVersion
        ? `${previousVersion} → ${thread.currentVersion || "Unknown"}`
        : thread.currentVersion || "Unknown";
      return `
        <article class="f95ue-library-inbox-entry" data-thread-id="${escapeHtml(id)}">
          <div>
            <strong class="f95ue-library-inbox-title">${escapeHtml(thread.title || `Thread ${id}`)}</strong>
            <div class="f95ue-library-inbox-meta">
              <span>Version: ${escapeHtml(versionText)}</span>
              <span>Detected: ${escapeHtml(formatDate(detectedAt))}</span>
              <span>Status: ${escapeHtml(record?.personal?.status || "saved")}</span>
            </div>
          </div>
          <div class="f95ue-library-inbox-actions">
            <button type="button" data-inbox-action="edit" data-thread-id="${escapeHtml(id)}"${busy ? " disabled" : ""}>Edit</button>
            <button type="button" data-inbox-action="acknowledge" data-thread-id="${escapeHtml(id)}"${busy ? " disabled" : ""}>Acknowledge</button>
          </div>
        </article>`;
    })
    .join("");

  return `
    <section class="f95ue-library-update-inbox" data-role="update-inbox">
      <div class="f95ue-library-inbox-summary">${escapeHtml(countText)}</div>
      <div class="f95ue-library-inbox-status" data-role="inbox-status" aria-live="polite">${escapeHtml(status || (loading ? "Loading updates…" : ""))}</div>
      <div class="f95ue-library-inbox-list" data-role="inbox-list">
        ${rows || (!loading ? '<div class="f95ue-library-inbox-empty">No unacknowledged updates.</div>' : "")}
      </div>
      <div class="f95ue-library-inbox-footer">
        ${hasNext ? `<button type="button" data-inbox-action="more"${busy ? " disabled" : ""}>Load more</button>` : ""}
        ${entries.length ? `<button type="button" class="primary" data-inbox-action="acknowledge-all"${busy ? " disabled" : ""}>Acknowledge all</button>` : ""}
        <button type="button" data-inbox-action="close">Close</button>
      </div>
    </section>
  `.trim();
}
