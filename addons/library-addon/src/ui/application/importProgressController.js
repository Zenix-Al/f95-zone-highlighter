import {
  createImportProgressMarkup,
  updateImportProgressView,
} from "../components/manager/importProgressDialog.js";

const IMPORT_PROGRESS_DIALOG_ID = "library-import-progress";

let coreBridge = null;
let activeImport = null;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function updateProgressContent(progress) {
  const root = activeImport?.contentId ? document.getElementById(activeImport.contentId) : null;
  updateImportProgressView(root, progress, {
    total: activeImport?.total || 0,
    totalBatches: activeImport?.totalBatches || 0,
  });
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

export async function openImportProgress(configOrTotal) {
  if (!coreBridge) return false;

  const config =
    configOrTotal && typeof configOrTotal === "object"
      ? configOrTotal
      : { total: Number(configOrTotal || 0) };

  activeImport = {
    cancelled: false,
    closing: false,
    contentId: "",
    total: Math.max(0, Number(config.total || 0)),
    totalBatches: Math.max(0, Number(config.totalBatches || 0)),
    throttle: config.throttle && typeof config.throttle === "object" ? config.throttle : {},
  };

  let result = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    result = await coreBridge.invokeCoreAction("ui.dialog.open", {
      dialogId: IMPORT_PROGRESS_DIALOG_ID,
      title: "Importing Library",
      html: createImportProgressMarkup({
        total: activeImport.total,
        totalBatches: activeImport.totalBatches,
        throttle: activeImport.throttle,
      }),
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
