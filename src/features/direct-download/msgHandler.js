import stateManager, { cache, colorState, config } from "../../config.js";
import { showToast } from "../../ui/components/toast";
import { injectFrame } from "./iframe.js";
import resourceManager from "../../core/resourceManager.js";
import { addListener, removeListener } from "../../core/listenerRegistry.js";

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

const MSG_HANDLER_LISTENER_ID = "direct-download-msg-handler";
export function handleMsgEvent() {
  if (stateManager.get("isMsgEventHandlerApplied")) return;
  stateManager.set("isMsgEventHandlerApplied", true);

  function handler({ data }) {
    if (!data || !data.op || !data.src) return;

    const { op, src, dest } = data;

    // We only care about these two operations.
    if (op !== "FAILED" && op !== "DOWNLOAD_LINK_RESOLVED") {
      return;
    }

    const ctx = cleanupIframeContext(src);
    if (!ctx) return; // Context already cleaned up or never existed.

    if (op === "FAILED") {
      Object.assign(ctx.el.style, {
        color: colorState.FAILED.color,
        fontWeight: "bold",
        textDecoration: "none",
      });
      showToast("Download failed or file not found, open in new tab.");
      window.open(src, "_blank");
    } else {
      // This must be DOWNLOAD_LINK_RESOLVED
      ctx.el.dataset.state = "resolved";
      if (dest) ctx.el.href = dest; // so right-click "open in new tab" works too
      Object.assign(ctx.el.style, {
        color: colorState.SUCCESS.color,
        fontWeight: "bold",
        textDecoration: "none",
      });
      if (dest) {
        showToast("Direct download started...");
        injectFrame(dest, { onSuccess: () => showToast("Direct download initiated.") });
      }
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
