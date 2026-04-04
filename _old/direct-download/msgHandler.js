import stateManager, { cache, colorState, config } from "../../config.js";
import { showToast } from "../../ui/components/toast";
import { injectFrame } from "./iframe.js";
import resourceManager from "../../core/resourceManager.js";
import { addListener, removeListener } from "../../core/listenerRegistry.js";
import { getDirectDownloadHostContext } from "./hostPackages.js";
import { markDirectDownloadHostFailure, markDirectDownloadHostSuccess } from "./hostBreaker.js";

function cleanupIframeContext(src) {
  const ctx = cache.get(src);
  if (!ctx) return null;

  clearTimeout(ctx.timer);
  if (ctx.frame) ctx.frame.remove();
  cache.delete(src);
  // cleanup any registered resource for this src
  try {
    resourceManager.cleanup(`direct-download:${encodeURIComponent(src)}`);
  } catch {}
  return ctx;
}

function applyLinkStyle(el, state) {
  Object.assign(el.style, {
    color: colorState[state].color,
    fontWeight: "bold",
    textDecoration: "none",
  });
}

async function handleFailed(ctx, src, packageKey) {
  applyLinkStyle(ctx.el, "FAILED");
  showToast("Download failed or file not found, open in new tab.");

  if (packageKey) {
    const breakerResult = await markDirectDownloadHostFailure(
      packageKey,
      "Iframe resolver failed or file not found.",
    );
    if (breakerResult?.tripped) {
      showToast(
        `${packageKey.charAt(0).toUpperCase() + packageKey.slice(1)} auto-disabled after 3 consecutive failures.`,
      );
    }
  }

  window.open(src, "_blank");
}

async function handleResolved(ctx, dest, packageKey) {
  ctx.el.dataset.state = "resolved";
  if (dest) ctx.el.href = dest; // so right-click "open in new tab" works too
  applyLinkStyle(ctx.el, "SUCCESS");

  if (packageKey) {
    await markDirectDownloadHostSuccess(packageKey);
  }

  if (dest) {
    showToast("Direct download started...");
    injectFrame(dest, { onSuccess: () => showToast("Direct download initiated.") });
  }
}

const MSG_HANDLER_LISTENER_ID = "direct-download-msg-handler";
export function handleMsgEvent() {
  if (stateManager.get("isMsgEventHandlerApplied")) return;
  stateManager.set("isMsgEventHandlerApplied", true);

  async function handler({ data }) {
    if (!data || !data.op || !data.src) return;

    const { op, src, dest } = data;
    if (op !== "FAILED" && op !== "DOWNLOAD_LINK_RESOLVED") return;

    let packageKey = null;
    try {
      packageKey = getDirectDownloadHostContext(new URL(src).hostname)?.packageKey || null;
    } catch {
      packageKey = null;
    }

    const ctx = cleanupIframeContext(src);
    if (!ctx) return; // Context already cleaned up or never existed.

    if (op === "FAILED") {
      await handleFailed(ctx, src, packageKey);
    } else {
      await handleResolved(ctx, dest, packageKey);
    }
  }
  addListener(MSG_HANDLER_LISTENER_ID, window, "message", handler);
}

export function disableMsgEventHandler() {
  if (!stateManager.get("isMsgEventHandlerApplied")) return;
  removeListener(MSG_HANDLER_LISTENER_ID);
  stateManager.set("isMsgEventHandlerApplied", false);
}

export function toggleMsgEventHandler() {
  if (config.threadSettings.directDownloadLinks) {
    handleMsgEvent();
  } else {
    disableMsgEventHandler();
  }
}
