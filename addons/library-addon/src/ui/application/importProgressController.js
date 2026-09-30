import { createOperationProgressMarkup, operationProgressCss, updateOperationProgressView } from "../components/manager/importProgressDialog.js";
import { closeDialog, openDialog } from "../../api/ui/dialog.js";
import { registerStyle, unregisterStyle } from "../../api/ui/style.js";

const DIALOG_ID = "library-import-progress";
const STYLE_ID = "library-operation-progress-style";
let coreBridge = null;
let active = null;
let cancelledAfterClose = false;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rootFor = (operation) => operation?.contentId ? document.getElementById(operation.contentId) : null;

function render(operation) {
  if (!operation) return;
  updateOperationProgressView(rootFor(operation), {
    label: operation.label,
    total: operation.total,
    totalBatches: operation.totalBatches,
    ...operation.progress,
    status: operation.cancelled ? "cancelling" : operation.progress?.status,
  });
}

export function configureImportProgress(bridge) { coreBridge = bridge; }

export async function openOperationProgress({ label = "Importing library", total = 0, totalBatches = 0 } = {}) {
  if (!coreBridge || active) return false;
  cancelledAfterClose = false;
  const operation = { label, total, totalBatches, progress: {}, cancelled: false, closing: false, contentId: "" };
  active = operation;
  const styled = await registerStyle(coreBridge, STYLE_ID, operationProgressCss);
  if (!styled?.ok) { active = null; return false; }
  let result;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    result = await openDialog(coreBridge, {
      dialogId: DIALOG_ID, title: label, html: createOperationProgressMarkup(),
      closeOnBackdrop: false, closeOnEsc: false, size: "sm",
    });
    if (result?.ok || result?.reason !== "rate_limited") break;
    await wait(1000 * (attempt + 1));
  }
  if (!result?.ok) {
    active = null;
    await unregisterStyle(coreBridge, STYLE_ID);
    return false;
  }
  operation.contentId = String(result.value?.contentId || "");
  rootFor(operation)?.querySelector('[data-action="cancel-operation"]')?.addEventListener("click", () => {
    operation.cancelled = true;
    render(operation);
  });
  render(operation);
  return true;
}

export function updateOperationProgress(progress) {
  if (!active) return;
  active.progress = { ...active.progress, ...progress };
  render(active);
}

export function isOperationCancelled() { return Boolean(active?.cancelled || cancelledAfterClose); }

export async function finishOperationProgress(reason = "operation-complete") {
  if (!active || !coreBridge) return;
  active.closing = true;
  await closeDialog(coreBridge, DIALOG_ID, reason);
  active = null;
  await unregisterStyle(coreBridge, STYLE_ID);
}

export async function openImportProgress(config = {}) {
  return openOperationProgress({ label: "Importing library", total: config.total, totalBatches: config.totalBatches });
}
export function updateImportProgress(progress) { updateOperationProgress(progress); }
export function isImportCancelled() { return isOperationCancelled(); }
export async function finishImportProgress(reason = "import-complete") { await finishOperationProgress(reason); }
export async function cancelActiveImport(reason = "runtime-disabled") {
  if (!active) return { ok: true, value: { alreadyCancelled: true } };
  active.cancelled = true;
  cancelledAfterClose = true;
  await finishOperationProgress(reason);
  return { ok: true };
}
export function handleImportProgressDialogClosed(detail = {}) {
  if (String(detail.dialogId || "") === DIALOG_ID && active && !active.closing) active.cancelled = true;
}
