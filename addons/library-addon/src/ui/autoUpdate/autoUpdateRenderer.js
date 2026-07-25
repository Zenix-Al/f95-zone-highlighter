import cssTemplate from "./autoUpdate.css";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function getAutoUpdateStyleText(root = ".f95ue-library-auto-dialog") {
  return cssTemplate.replaceAll("__ROOT__", root);
}

export function formatAutoUpdateSummary(summary) {
  if (!summary) return "Status: idle; no completed run";
  const nextRun = summary.nextRunAt
    ? new Date(summary.nextRunAt).toLocaleString()
    : "not scheduled";
  const progress =
    summary.status === "running"
      ? `; progress ${Math.min(Number(summary.checked || 0) + Number(summary.skipped || 0), Number(summary.total || 0))} / ${Number(summary.total || 0)}${summary.activeThreadId ? `; checking thread ${summary.activeThreadId}` : ""}`
      : "";
  return `Status: ${summary.status || "idle"}${progress}; next ${nextRun}; checked ${summary.checked || 0}, current ${summary.current || 0}, changed ${summary.changed || 0}, failed ${summary.failed || 0}, skipped ${summary.skipped || 0}, retries ${summary.retries || 0}`;
}

export function renderAutoUpdateDialog(config, summary) {
  const numberField = (label, name, value, min, max) => `
    <label>
      <span>${label}</span>
      <input name="${name}" type="number" min="${min}" max="${max}" value="${escapeHtml(value)}">
    </label>`;

  return `
    <form class="f95ue-library-auto-dialog" data-role="auto-update-dialog">
      <div class="f95ue-library-auto-summary" data-role="autoUpdateSummary">${escapeHtml(formatAutoUpdateSummary(summary))}</div>
      <div class="f95ue-library-auto-grid">
        <label class="f95ue-library-auto-toggle">
          <input name="enabled" type="checkbox"${config.enabled !== false ? " checked" : ""}>
          <span>Check eligible Library records automatically</span>
        </label>
        ${numberField("Interval (hours)", "intervalHours", Number(config.intervalMs || 0) / 3600000, 6, 720)}
        ${numberField("Spacing (ms)", "spacingMs", config.spacingMs, 5000, 30000)}
        ${numberField("Timeout (ms)", "timeoutMs", config.timeoutMs, 1000, 30000)}
        ${numberField("Retries", "retryLimit", config.retryLimit, 0, 5)}
        ${numberField("Session cap", "sessionCap", config.sessionCap, 1, 100)}
        ${numberField("Daily cap", "dailyCap", config.dailyCap, 1, 500)}
      </div>
      <div class="f95ue-library-auto-actions">
        <button type="button" data-auto-action="retry">Retry failed now</button>
        <button type="button" data-auto-action="cancel">Cancel</button>
        <button type="submit" class="primary">Save</button>
      </div>
    </form>
  `.trim();
}
