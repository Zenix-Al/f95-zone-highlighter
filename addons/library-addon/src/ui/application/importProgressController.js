import {
  createImportProgressMarkup,
  updateImportProgressView,
} from "../components/manager/importProgressDialog.js";
import { closeDialog, openDialog, updateDialog } from "../../api/ui/dialog.js";

const IMPORT_PROGRESS_DIALOG_ID = "library-import-progress";

let coreBridge = null;
let activeImport = null;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function bindCancelButton() {
  const root = activeImport?.contentId ? document.getElementById(activeImport.contentId) : null;
  root?.querySelector('[data-action="cancel-import"]')?.addEventListener("click", () => {
    void closeProgressDialog("cancel-import", true);
  });
}

async function updateProgressContent(progress) {
  if (!activeImport || !coreBridge) return;
  const html = createImportProgressMarkup({
    total: activeImport.total,
    totalBatches: activeImport.totalBatches,
    throttle: activeImport.throttle,
    progress,
  });
  const result = await updateDialog(
    coreBridge,
    IMPORT_PROGRESS_DIALOG_ID,
    html,
    () => {
      const root = activeImport?.contentId ? document.getElementById(activeImport.contentId) : null;
      updateImportProgressView(root, progress, {
        total: activeImport?.total || 0,
        totalBatches: activeImport?.totalBatches || 0,
      });
      return { ok: false, reason: "unsupported_action" };
    },
  );
  if (result?.ok) bindCancelButton();
  if (!result?.ok && result?.reason !== "unsupported_action" && result?.reason !== "dialog_not_found") {
    const root = activeImport?.contentId ? document.getElementById(activeImport.contentId) : null;
    updateImportProgressView(root, progress, {
      total: activeImport?.total || 0,
      totalBatches: activeImport?.totalBatches || 0,
    });
  }
}

async function closeProgressDialog(reason, cancelImport = false) {
  if (!activeImport || !coreBridge) return;
  if (cancelImport) activeImport.cancelled = true;
  activeImport.closing = true;
  await closeDialog(coreBridge, IMPORT_PROGRESS_DIALOG_ID, reason);
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
    result = await openDialog(coreBridge, {
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
  bindCancelButton();
  return true;
}

export function updateImportProgress(progress) {
  if (activeImport?.cancelled) return;
  updateProgressContent(progress);
}

export function isImportCancelled() {
  return Boolean(activeImport?.cancelled);
}

export async function cancelActiveImport(reason = "runtime-disabled") {
  if (!activeImport) return { ok: true, value: { alreadyCancelled: true } };
  activeImport.cancelled = true;
  await closeProgressDialog(reason, true);
  return { ok: true };
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
