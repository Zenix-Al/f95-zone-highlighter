import { config } from "../../config.js";
import { saveConfigKeys } from "../../services/settingsService.js";
import { showToast } from "../../ui/components/toast.js";
import { normalizeProcessingDownloadTrigger } from "../../utils/processingDownloadTrigger.js";
import { clearProcessingDownloadFlag, markHostDownloadFailure } from "./hostFlowHelpers.js";

export const DIRECT_DOWNLOAD_ATTENTION_KEY = "directDownloadAttentionEvent";
const DIRECT_DOWNLOAD_TAB_ID_KEY = "f95ue.directDownload.tabId";

export function getDirectDownloadAttentionTabId() {
  try {
    const existing = sessionStorage.getItem(DIRECT_DOWNLOAD_TAB_ID_KEY);
    if (existing && existing.trim().length > 0) return existing;
    const generated = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(DIRECT_DOWNLOAD_TAB_ID_KEY, generated);
    return generated;
  } catch {
    // Fallback still keeps this runtime stable.
    return `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

export async function publishDirectDownloadAttention(host, message, code = "manual_required") {
  const safeHost = String(host || "unknown");
  const safeMessage = String(message || "Direct download needs manual action.");

  const trigger = normalizeProcessingDownloadTrigger(config.processingDownload);
  const targetTabId = trigger.active ? trigger.ownerTabId || null : null;
  const requestId = trigger.active ? trigger.requestId || null : null;

  try {
    await saveConfigKeys({
      [DIRECT_DOWNLOAD_ATTENTION_KEY]: {
        ts: Date.now(),
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        host: safeHost,
        code,
        message: safeMessage,
        href: location.href,
        targetTabId,
        requestId,
      },
    });
  } catch {
    // best-effort
  }
}

function titleCase(value) {
  const text = String(value || "").trim();
  if (!text) return "Host";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export async function handleDirectDownloadFailure({
  packageKey,
  host,
  message,
  code = "manual_required",
  showFailureToast = true,
  clearProcessing = true,
  trippedToast,
}) {
  const safePackageKey = String(packageKey || "").trim();
  const safeHost = String(host || "unknown").trim() || "unknown";
  const safeMessage = String(message || "Direct download needs manual action.");

  if (showFailureToast) {
    showToast(safeMessage);
  }

  if (safePackageKey) {
    const breakerResult = await markHostDownloadFailure(safePackageKey, safeMessage);
    if (breakerResult?.tripped) {
      const defaultTrippedToast = `${titleCase(safePackageKey)} auto-disabled after 3 consecutive failures.`;
      showToast(trippedToast || defaultTrippedToast);
    }
  }

  await publishDirectDownloadAttention(safeHost, safeMessage, code);

  if (clearProcessing) {
    await clearProcessingDownloadFlag();
  }
}
