export function createBulkImportProgressMarkup({
  total = 0,
  totalBatches = 0,
  throttle = {},
} = {}) {
  const suggestedMinIntervalMs = Math.max(
    0,
    Number(throttle?.coreAction?.suggestedMinIntervalMs || 0),
  );
  const maxPayloadBytes = Math.max(0, Number(throttle?.payloadLimits?.idb?.maxPayloadBytes || 0));
  const maxBulkItems = Math.max(0, Number(throttle?.payloadLimits?.idb?.maxBulkItems || 0));

  return `
    <div class="f95ue-example-progress">
      <div class="f95ue-example-progress-title">Preparing throttled bulk import...</div>
      <progress data-role="bulk-progress-bar" max="${Math.max(1, total)}" value="0"></progress>
      <div class="f95ue-example-progress-detail" data-role="bulk-progress-detail">
        0 / ${total} records | 0 / ${totalBatches} batches
      </div>
      <div class="f95ue-example-progress-note">
        pacing ${suggestedMinIntervalMs}ms between requests | payload ceiling ${maxPayloadBytes} bytes | batch items <= ${maxBulkItems}
      </div>
      <button type="button" class="f95ue-example-button secondary" data-example-action="bulk-import-cancel">
        Cancel Import
      </button>
      <div class="f95ue-example-progress-note">Closing this dialog stops the import after the current batch.</div>
    </div>
  `;
}

export function updateBulkImportProgressView(root, progress = {}, fallbackTotal = 0) {
  if (!root) return;

  const processed = Math.max(0, Number(progress?.processed || 0));
  const total = Math.max(0, Number(progress?.total || fallbackTotal || 0));
  const completedBatches = Math.max(0, Number(progress?.completedBatches || 0));
  const totalBatches = Math.max(0, Number(progress?.totalBatches || 0));
  const failed = Math.max(0, Number(progress?.failed || 0));
  const cancelled = Boolean(progress?.cancelled);
  const status = String(progress?.status || "running").trim();

  const bar = root.querySelector('[data-role="bulk-progress-bar"]');
  const detail = root.querySelector('[data-role="bulk-progress-detail"]');
  const title = root.querySelector(".f95ue-example-progress-title");

  if (bar) {
    bar.max = Math.max(1, total);
    bar.value = Math.min(processed, total);
  }

  if (title) {
    if (cancelled) {
      title.textContent = "Stopping bulk import...";
    } else if (status === "completed") {
      title.textContent = "Bulk import complete";
    } else if (status === "failed") {
      title.textContent = "Bulk import failed";
    } else {
      title.textContent = "Importing dummy IndexedDB records...";
    }
  }

  if (detail) {
    detail.textContent =
      `${processed} / ${total} records | ` +
      `${completedBatches} / ${totalBatches} batches | failed ${failed}`;
  }
}
