import { TIMINGS, SELECTORS } from "../constants.js";
import { sleep } from "../utils.js";

const GOFILE_BRIDGE_REQUEST_EVENT = "f95ue:gofile-download-request";
const GOFILE_BRIDGE_RESULT_EVENT = "f95ue:gofile-download-result";
const GOFILE_BRIDGE_MARKER = "__f95ue_gofile_bridge_installed";

function ensureGofilePageBridge() {
  try {
    if (window[GOFILE_BRIDGE_MARKER]) return true;

    const script = document.createElement("script");
    script.textContent = `
      (() => {
        if (window.${GOFILE_BRIDGE_MARKER}) return;
        window.${GOFILE_BRIDGE_MARKER} = true;
        window.addEventListener(${JSON.stringify(GOFILE_BRIDGE_REQUEST_EVENT)}, (event) => {
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
              new CustomEvent(${JSON.stringify(GOFILE_BRIDGE_RESULT_EVENT)}, {
                detail: { ok, reason },
              }),
            );
          } catch {}
        });
      })();
    `;

    (document.head || document.documentElement || document.body).appendChild(script);
    script.remove();
    return true;
  } catch {
    return false;
  }
}

function invokeGofileDownloadContent(contentId, timeoutMs = 1500) {
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

  if (!ensureGofilePageBridge()) {
    return Promise.resolve({ ok: false, source: "pageBridge", reason: "bridge_inject_failed" });
  }

  return new Promise((resolve) => {
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener(GOFILE_BRIDGE_RESULT_EVENT, onReply);
      resolve(result);
    };

    const onReply = (event) => {
      const detail = event?.detail || {};
      finish({
        ok: Boolean(detail.ok),
        source: "pageBridge",
        reason: typeof detail.reason === "string" ? detail.reason : "",
      });
    };

    const timer = setTimeout(
      () => finish({ ok: false, source: "pageBridge", reason: "bridge_timeout" }),
      timeoutMs,
    );

    window.addEventListener(GOFILE_BRIDGE_RESULT_EVENT, onReply, { once: true });
    window.dispatchEvent(
      new CustomEvent(GOFILE_BRIDGE_REQUEST_EVENT, {
        detail: { contentId },
      }),
    );
  });
}

export async function processGofileDownload({ showToast, notifyMainFailure, reportAddonHealthy }) {
  const waitForContentReady = (timeout = 20000) =>
    new Promise((resolve, reject) => {
      const start = Date.now();

      const check = () => {
        const loading = document.querySelector(SELECTORS.GOFILE.LOADING);
        const itemsList = document.querySelector(SELECTORS.GOFILE.ITEMS_LIST);
        const isReady =
          (!loading || getComputedStyle(loading).display === "none") &&
          itemsList &&
          itemsList.children.length > 0;

        if (isReady) {
          resolve(true);
          return;
        }
        if (Date.now() - start > timeout) {
          reject(new Error("Timeout waiting for gofile content"));
          return;
        }
        setTimeout(check, TIMINGS.POLL_INTERVAL);
      };

      check();
    });

  await waitForContentReady();
  await sleep(TIMINGS.GOFILE_POST_READY_WAIT);

  const alertEl = document.querySelector(SELECTORS.GOFILE.ALERT);
  if (alertEl && getComputedStyle(alertEl).display !== "none") {
    await notifyMainFailure("gofile.io", "Host reports file unavailable.");
    return;
  }

  const itemsList = document.querySelector(SELECTORS.GOFILE.ITEMS_LIST);
  if (!itemsList) {
    await notifyMainFailure("gofile.io", "File list not found.");
    return;
  }

  const itemElements = itemsList.querySelectorAll("[data-item-id]");
  if (itemElements.length !== 1) {
    await notifyMainFailure("gofile.io", "Automation requires exactly one file.");
    return;
  }

  const contentId = itemElements[0].getAttribute("data-item-id");
  if (!contentId) {
    await notifyMainFailure("gofile.io", "Missing content id.");
    return;
  }

  const bridgeResult = await invokeGofileDownloadContent(contentId);
  if (bridgeResult.ok) {
    showToast("Gofile download triggered.");
    reportAddonHealthy();
    return;
  }

  await notifyMainFailure(
    "gofile.io",
    `downloadContent bridge unavailable (${bridgeResult.reason || "unknown"}).`,
  );
}
