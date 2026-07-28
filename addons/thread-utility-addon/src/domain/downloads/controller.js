import { writeClipboard } from "../utilities/clipboard.js";
import { showCoreToast } from "../../api/toast.js";

export function createDownloadController({
  core,
  getContext,
  refreshSources,
  windowObject = globalThis.window,
  clipboardWriter = writeClipboard,
}) {
  function current(id) {
    const context = getContext();
    if (!context?.isCurrent?.()) return null;
    const item = context.downloads.find((entry) => entry.id === id);
    return item ? { context, item } : null;
  }

  function open(id) {
    const match = current(id);
    if (!match) return { ok: false, reason: "stale_generation" };
    windowObject?.open?.(match.item.originalUrl, "_blank", "noopener");
    return { ok: true };
  }

  async function copy(id) {
    const match = current(id);
    return match
      ? clipboardWriter(match.item.originalUrl)
      : { ok: false, reason: "stale_generation" };
  }

  async function copyAll() {
    const context = getContext();
    if (!context?.isCurrent?.()) return { ok: false, reason: "stale_generation" };
    return clipboardWriter(
      context.downloads.slice(0, 100).map((item) => item.originalUrl).join("\n"),
    );
  }

  function liveButton(match) {
    if (!match?.item.maskedDirectToken) return null;
    const button = match.context.getSource(match.item.maskedDirectToken);
    const expectedAttribute = match.item.actionType === "direct"
      ? "data-direct-href"
      : "data-masked-href";
    return (
      button?.isConnected
      && button.getAttribute("data-addon-id") === "masked-direct-addon"
      && button.getAttribute("data-action-type") === match.item.actionType
      && button.getAttribute(expectedAttribute) === match.item.originalUrl
    ) ? button : null;
  }

  async function delegate(id) {
    const match = current(id);
    if (!match?.item.maskedDirectToken) return { ok: false, reason: "unavailable" };
    let button = liveButton(match);
    if (!button && refreshSources) {
      await refreshSources();
      button = liveButton(current(id));
    }
    if (!button) {
      await showCoreToast(
        core,
        "Download action is no longer available. Refresh Thread Utility and try again.",
        "error",
      );
      return { ok: false, reason: "stale_source" };
    }
    button.click();
    return { ok: true };
  }

  return { copy, copyAll, delegate, open };
}
