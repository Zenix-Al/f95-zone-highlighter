export function createImportProgressMarkup({
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
    <div style="padding:16px;color:#f0f2f6;background:#191b1e;border:1px solid #3f4043;border-radius:10px;">
      <div data-role="import-progress-text" style="font-weight:700;margin-bottom:10px;">Preparing import...</div>
      <progress data-role="import-progress-bar" max="${Math.max(1, total)}" value="0" style="width:100%;"></progress>
      <div data-role="import-progress-detail" style="margin-top:10px;color:#b9c1cc;font-size:12px;">0 / ${total} records | 0 / ${totalBatches} batches</div>
      <div data-role="import-progress-note" style="margin-top:8px;color:#8f99a6;font-size:11px;">
        pacing ${suggestedMinIntervalMs}ms between requests | payload ceiling ${maxPayloadBytes} bytes | batch items <= ${maxBulkItems}
      </div>
      <button type="button" data-action="cancel-import" style="margin-top:14px;padding:7px 12px;cursor:pointer;">Cancel Import</button>
      <div style="margin-top:8px;color:#8f99a6;font-size:11px;">Closing this dialog stops the import.</div>
    </div>
  `;
}

export function updateImportProgressView(root, progress, fallback = {}) {
  if (!root) return;

  const processed = Math.max(0, Number(progress?.processed || 0));
  const total = Math.max(
    0,
    Number(progress?.total || fallback?.total || fallback || 0),
  );
  const completedBatches = Math.max(0, Number(progress?.completedBatches || 0));
  const totalBatches = Math.max(0, Number(progress?.totalBatches || fallback?.totalBatches || 0));
  const status = String(progress?.status || "running").trim();
  const bar = root.querySelector('[data-role="import-progress-bar"]');
  const text = root.querySelector('[data-role="import-progress-text"]');
  const detail = root.querySelector('[data-role="import-progress-detail"]');

  if (bar) {
    bar.max = Math.max(1, total);
    bar.value = Math.min(processed, total);
  }

  if (text) {
    if (progress?.cancelled || status === "cancelling") {
      text.textContent = "Stopping import...";
    } else if (status === "completed") {
      text.textContent = "Import complete";
    } else {
      text.textContent = "Importing library...";
    }
  }

  if (detail) {
    detail.textContent =
      `${processed} / ${total} records | ` +
      `${completedBatches} / ${totalBatches} batches | ` +
      `added ${progress?.added || 0} | ` +
      `updated ${progress?.updated || 0} | ` +
      `skipped ${progress?.skipped || 0} | ` +
      `failed ${progress?.failed || 0}`;
  }
}
