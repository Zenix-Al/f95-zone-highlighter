import { cache, colorState, config, state } from "../../config";
import { showToast } from "../../ui/components/modal";
import { injectFrame } from "./iframe.js";

function cleanupIframeContext(src) {
  const ctx = cache.get(src);
  if (!ctx) return null;

  clearTimeout(ctx.timer);
  if (ctx.frame) ctx.frame.remove();
  cache.delete(src);
  return ctx;
}

let clickHandlerDDME = null;
export function handleMsgEvent() {
  if (state.isMsgEventHandlerApplied) return;
  state.isMsgEventHandlerApplied = true;

  function handler({ data }) {
    if (!data) return;

    if (data.op === "FAILED") {
      const { src } = data;
      const ctx = cleanupIframeContext(src);
      if (!ctx) return;

      Object.assign(ctx.el.style, {
        color: colorState.FAILED.color,
        fontWeight: "bold",
        textDecoration: "none",
      });
      showToast("Download failed or file not found, open in new tab.");
      window.open(src, "_blank");
      return;
    }

    if (data.op !== "DOWNLOAD_LINK_RESOLVED") return;
    const { src, dest } = data;
    const ctx = cleanupIframeContext(src);
    if (!ctx) return;

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
  clickHandlerDDME = handler;
  window.addEventListener("message", clickHandlerDDME);
}

export function disableMsgEventHandler() {
  if (!state.isMsgEventHandlerApplied) return;
  if (clickHandlerDDME) {
    window.removeEventListener("message", clickHandlerDDME);
  }
  state.isMsgEventHandlerApplied = false;
}

export function toggleMsgEventHandler() {
  if (config.threadSettings.directDownloadLinks) {
    handleMsgEvent();
  } else {
    disableMsgEventHandler();
  }
}
