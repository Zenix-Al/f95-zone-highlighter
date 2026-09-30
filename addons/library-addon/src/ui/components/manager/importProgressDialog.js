export function createOperationProgressMarkup() {
  return `<div class="f95ue-library-operation-progress-root" role="status" aria-live="polite">
    <div class="f95ue-library-operation-title" data-role="operation-title">Preparing...</div>
    <div class="f95ue-library-operation-track" role="progressbar" aria-label="Operation progress" aria-valuemin="0" aria-valuemax="1" aria-valuenow="0"><div class="f95ue-library-operation-fill" data-role="operation-fill"></div></div>
    <div class="f95ue-library-operation-count" data-role="operation-count">0 / 0 records</div>
    <div class="f95ue-library-operation-detail" data-role="operation-detail"></div>
    <div class="f95ue-library-operation-actions"><button type="button" data-action="cancel-operation">Cancel</button><span>Stopping keeps changes already made.</span></div>
  </div>`;
}

export const operationProgressCss = `
.f95ue-library-operation-progress-root { padding: 18px; color: #f0f2f6; font: 13px/1.5 sans-serif; }
.f95ue-library-operation-progress-root .f95ue-library-operation-title { font-size: 16px; font-weight: 700; margin-bottom: 14px; }
.f95ue-library-operation-progress-root .f95ue-library-operation-track { height: 9px; overflow: hidden; border-radius: 99px; background: #343941; }
.f95ue-library-operation-progress-root .f95ue-library-operation-fill { height: 100%; width: 0; border-radius: inherit; background: #c15858; transition: width .15s ease; }
.f95ue-library-operation-progress-root .f95ue-library-operation-count { margin-top: 12px; font-weight: 700; }
.f95ue-library-operation-progress-root .f95ue-library-operation-detail { margin-top: 4px; color: #aeb6c2; }
.f95ue-library-operation-progress-root .f95ue-library-operation-actions { display: flex; align-items: center; gap: 12px; margin-top: 18px; color: #909aa7; font-size: 12px; }
.f95ue-library-operation-progress-root button { border: 1px solid #a84b4d; border-radius: 6px; background: #893839; color: white; padding: 7px 14px; font-weight: 600; cursor: pointer; }
.f95ue-library-operation-progress-root button:disabled { opacity: .55; cursor: default; }
@media (prefers-reduced-motion: reduce) { .f95ue-library-operation-progress-root .f95ue-library-operation-fill { transition: none; } }
`;

export function updateOperationProgressView(root, { label = "Working", total = 0, processed = 0, updated = 0, removed = 0, added = 0, skipped = 0, failed = 0, completedBatches = 0, totalBatches = 0, status = "running" } = {}) {
  if (!root) return;
  const done = Math.max(0, Number(processed) || 0);
  const count = Math.max(0, Number(total) || 0);
  const title = root.querySelector('[data-role="operation-title"]');
  const track = root.querySelector('[role="progressbar"]');
  const fill = root.querySelector('[data-role="operation-fill"]');
  const countEl = root.querySelector('[data-role="operation-count"]');
  const detail = root.querySelector('[data-role="operation-detail"]');
  if (title) title.textContent = status === "cancelling" ? `Stopping ${label.toLowerCase()}...` : status === "completed" ? `${label} complete` : `${label}...`;
  if (track) {
    track.setAttribute("aria-valuemax", String(Math.max(1, count)));
    track.setAttribute("aria-valuenow", String(Math.min(done, count)));
  }
  if (fill) fill.style.width = `${count ? Math.min(100, Math.round(done / count * 100)) : 0}%`;
  if (countEl) countEl.textContent = `${done} / ${count} records`;
  if (detail) detail.textContent = totalBatches
    ? `${completedBatches} / ${totalBatches} batches · added ${added} · updated ${updated} · skipped ${skipped} · failed ${failed}`
    : `${updated + removed} changed · ${skipped} skipped`;
  const cancel = root.querySelector('[data-action="cancel-operation"]');
  if (cancel) cancel.disabled = status === "cancelling" || status === "completed";
}
