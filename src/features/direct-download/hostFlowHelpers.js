import { config } from "../../config.js";
import { saveConfigKeys } from "../../services/settingsService.js";
import { styleDownloadSuccess } from "../../utils/helpers.js";
import {
  createInactiveProcessingDownloadTrigger,
  isProcessingDownloadTriggerActive,
  normalizeProcessingDownloadTrigger,
} from "../../utils/processingDownloadTrigger.js";
import { markDirectDownloadHostFailure, markDirectDownloadHostSuccess } from "./hostBreaker.js";

const GOFILE_BRIDGE_REQUEST_EVENT = "f95ue:gofile-download-request";
const GOFILE_BRIDGE_RESULT_EVENT = "f95ue:gofile-download-result";
const GOFILE_BRIDGE_MARKER = "__f95ue_gofile_bridge_installed";

export async function clearProcessingDownloadFlag() {
  const inactive = createInactiveProcessingDownloadTrigger();
  config.processingDownload = inactive;
  await saveConfigKeys({ processingDownload: inactive });
}

export async function isProcessingDownloadFlowActive() {
  const trigger = normalizeProcessingDownloadTrigger(config.processingDownload);
  config.processingDownload = trigger;
  if (!trigger.active) return false;
  if (isProcessingDownloadTriggerActive(trigger)) return true;
  await clearProcessingDownloadFlag();
  return false;
}

export async function clearProcessingAndTryCloseTab() {
  await clearProcessingDownloadFlag();
  try {
    window.close();
  } catch (e) {
    console.warn("Close blocked (normal if tab not script-opened)", e);
    const msg = document.createElement("div");
    msg.innerHTML = `
      <div>
        Download started! You can close this tab now.
      </div>
    `;
    const el = msg.firstElementChild;
    styleDownloadSuccess(el, { background: "#ec5555", color: "white" });
    document.body.appendChild(el);
  }
}

function ensureGofilePageBridge() {
  if (!document?.documentElement) return false;
  if (document.documentElement.dataset[GOFILE_BRIDGE_MARKER] === "1") return true;

  const script = document.createElement("script");
  script.type = "text/javascript";
  script.textContent = `
    (() => {
      if (window.__f95ueGofileBridgeInstalled) return;
      window.__f95ueGofileBridgeInstalled = true;
      window.addEventListener("${GOFILE_BRIDGE_REQUEST_EVENT}", (event) => {
        let ok = false;
        let reason = "";
        try {
          const contentId = event?.detail?.contentId;
          if (!contentId) {
            reason = "missing_content_id";
          } else if (typeof window.downloadContent !== "function") {
            reason = "downloadContent_unavailable";
          } else {
            window.downloadContent(contentId);
            ok = true;
          }
        } catch (error) {
          reason = error?.message ? String(error.message) : "downloadContent_throw";
        }
        try {
          window.dispatchEvent(
            new CustomEvent("${GOFILE_BRIDGE_RESULT_EVENT}", {
              detail: { ok, reason },
            }),
          );
        } catch {}
      });
    })();
  `;
  try {
    document.documentElement.appendChild(script);
    script.remove();
    document.documentElement.dataset[GOFILE_BRIDGE_MARKER] = "1";
    return true;
  } catch {
    try {
      script.remove();
    } catch {
      // ignore remove failure
    }
    return false;
  }
}

export function invokeGofileDownloadContent(contentId, timeoutMs = 1500) {
  if (!contentId) {
    return Promise.resolve({ ok: false, source: "input", reason: "missing_content_id" });
  }
  try {
    if (typeof window.downloadContent === "function") {
      window.downloadContent(contentId);
      return Promise.resolve({ ok: true, source: "window" });
    }
  } catch (error) {
    return Promise.resolve({
      ok: false,
      source: "window",
      reason: error?.message ? String(error.message) : "window_downloadContent_throw",
    });
  }

  const bridgeReady = ensureGofilePageBridge();
  if (!bridgeReady) {
    return Promise.resolve({ ok: false, source: "pageBridge", reason: "bridge_inject_failed" });
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener(GOFILE_BRIDGE_RESULT_EVENT, onResult);
      resolve(result);
    };
    const onResult = (event) => {
      const detail = event?.detail || {};
      finish({
        ok: Boolean(detail.ok),
        source: "pageBridge",
        reason: typeof detail.reason === "string" ? detail.reason : "",
      });
    };
    const timer = setTimeout(() => {
      finish({ ok: false, source: "pageBridge", reason: "bridge_timeout" });
    }, timeoutMs);
    window.addEventListener(GOFILE_BRIDGE_RESULT_EVENT, onResult);
    try {
      window.dispatchEvent(
        new CustomEvent(GOFILE_BRIDGE_REQUEST_EVENT, {
          detail: { contentId },
        }),
      );
    } catch (error) {
      finish({
        ok: false,
        source: "pageBridge",
        reason: error?.message ? String(error.message) : "bridge_dispatch_failed",
      });
    }
  });
}

export async function markHostDownloadFailure(packageKey, message = "") {
  return markDirectDownloadHostFailure(packageKey, message);
}

export async function markHostDownloadSuccess(packageKey) {
  return markDirectDownloadHostSuccess(packageKey);
}
