const IMPORT_PROGRESS_DIALOG_ID = "library-import-progress";

let coreBridge = null;
let activeImport = null;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function progressMarkup(total) {
  return `
    <div style="padding:16px;color:#f0f2f6;background:#191b1e;border:1px solid #3f4043;border-radius:10px;">
      <div data-role="import-progress-text" style="font-weight:700;margin-bottom:10px;">Preparing import...</div>
      <progress data-role="import-progress-bar" max="${Math.max(1, total)}" value="0" style="width:100%;"></progress>
      <div data-role="import-progress-detail" style="margin-top:10px;color:#b9c1cc;font-size:12px;">0 / ${total} records</div>
      <button type="button" data-action="cancel-import" style="margin-top:14px;padding:7px 12px;cursor:pointer;">Cancel Import</button>
      <div style="margin-top:8px;color:#8f99a6;font-size:11px;">Closing this dialog stops the import.</div>
    </div>
  `;
}

function updateProgressContent(progress) {
  const root = activeImport?.contentId ? document.getElementById(activeImport.contentId) : null;
  if (!root) return;

  const processed = Math.max(0, Number(progress?.processed || 0));
  const total = Math.max(0, Number(progress?.total || activeImport.total || 0));
  const bar = root.querySelector('[data-role="import-progress-bar"]');
  const text = root.querySelector('[data-role="import-progress-text"]');
  const detail = root.querySelector('[data-role="import-progress-detail"]');

  if (bar) {
    bar.max = Math.max(1, total);
    bar.value = Math.min(processed, total);
  }
  if (text) text.textContent = progress?.cancelled ? "Stopping import..." : "Importing library...";
  if (detail) {
    detail.textContent = `${processed} / ${total} records | added ${progress?.added || 0} | updated ${progress?.updated || 0} | skipped ${progress?.skipped || 0} | failed ${progress?.failed || 0}`;
  }
}

async function closeProgressDialog(reason, cancelImport = false) {
  if (!activeImport || !coreBridge) return;
  if (cancelImport) activeImport.cancelled = true;
  activeImport.closing = true;
  await coreBridge.invokeCoreAction("ui.dialog.close", {
    dialogId: IMPORT_PROGRESS_DIALOG_ID,
    reason,
  });
}

export function configureImportProgress(bridge) {
  coreBridge = bridge;
}

export async function openImportProgress(total) {
  if (!coreBridge) return false;

  activeImport = {
    cancelled: false,
    closing: false,
    contentId: "",
    total: Math.max(0, Number(total || 0)),
  };

  let result = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    result = await coreBridge.invokeCoreAction("ui.dialog.open", {
      dialogId: IMPORT_PROGRESS_DIALOG_ID,
      title: "Importing Library",
      html: progressMarkup(activeImport.total),
      closeOnBackdrop: true,
      closeOnEsc: true,
      size: "sm",
    });
    if (result?.ok || result?.reason !== "rate_limited") break;
    await wait(1000 * (attempt + 1));
  }

  if (!result?.ok) {
    activeImport = null;
    return false;
  }

  activeImport.contentId = String(result?.value?.contentId || "").trim();
  const root = activeImport.contentId ? document.getElementById(activeImport.contentId) : null;
  root?.querySelector('[data-action="cancel-import"]')?.addEventListener("click", () => {
    void closeProgressDialog("cancel-import", true);
  });
  return true;
}

export function updateImportProgress(progress) {
  updateProgressContent(progress);
}

export function isImportCancelled() {
  return Boolean(activeImport?.cancelled);
}

export async function finishImportProgress(reason = "import-complete") {
  if (!activeImport) return;
  await closeProgressDialog(reason, false);
  activeImport = null;
}

export function handleImportProgressDialogClosed(detail = {}) {
  if (String(detail.dialogId || "") !== IMPORT_PROGRESS_DIALOG_ID || !activeImport) return;
  if (!activeImport.closing) {
    activeImport.cancelled = true;
    updateProgressContent({ total: activeImport.total, cancelled: true });
  }
}
