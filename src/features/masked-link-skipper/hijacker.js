import stateManager, { config } from "../../config.js";
import { showToast } from "../../ui/components/toast.js";
import { routeDownloadUrl } from "../../services/downloadRouter.js";
import { resolveMaskedLink } from "./resolver.js";
import { addListener, removeListener } from "../../core/listenerRegistry.js";

function normalizeResolvedUrl(url, fallback) {
  const raw = String(url || "")
    .trim()
    .replace(/&amp;/gi, "&");
  if (!raw) return fallback;

  try {
    const parsed = new URL(raw, window.location.href);
    if (!["http:", "https:"].includes(parsed.protocol)) return fallback;
    return parsed.href;
  } catch {
    return fallback;
  }
}

/**
 * Dispatches a resolved URL to the appropriate handler (direct download, iframe, new tab).
 * @param {string} url The URL to handle.
 */
async function dispatchResolvedLink(url, { anchorEl = null } = {}) {
  const safeUrl = normalizeResolvedUrl(url, url);
  if (config.threadSettings.directDownloadLinks) {
    const result = await routeDownloadUrl(safeUrl, {
      anchorEl,
      fallbackToNewTab: false,
    });
    if (result.handled) return;
  }

  window.open(safeUrl, "_blank");
}

/**
 * On thread pages, this hijacks clicks on masked links to resolve them
 * in the background without leaving the page.
 */
export function hijackMaskedLinks() {
  if (location.pathname.startsWith("/masked/")) return;
  if (stateManager.get("isMaskedLinkApplied")) return;
  if (!config.threadSettings.skipMaskedLink) return;

  const CLICK_LISTENER_ID = "masked-link-click-hijack";
  const AUXCLICK_LISTENER_ID = "masked-link-auxclick-hijack";

  stateManager.set("isMaskedLinkApplied", true);

  const handler = function (e) {
    if (e.button !== 0 && e.button !== 1) return; // Only left or middle

    let link = e.target.closest('a[href^="/masked/"], a[href^="https://f95zone.to/masked/"]');
    if (!link) return;

    let href = link.getAttribute("href");
    if (href.startsWith("/masked/")) {
      href = "https://f95zone.to" + href;
    }
    const path = new URL(href).pathname;

    e.preventDefault();
    e.stopImmediatePropagation();
    showToast("Resolving masked link...");
    link.style.color = "#ffff00"; // Yellow while working

    let targetUrl = href; // Default fallback to the original masked link

    resolveMaskedLink("https://f95zone.to" + path)
      .then((data) => {
        if (data.status === "ok" && data.msg) {
          showToast("Masked link resolved.");
          targetUrl = normalizeResolvedUrl(data.msg, href);
          link.href = targetUrl; // Update link href for future clicks/hovers
          link.style.color = "#00ff00"; // Green success
        } else {
          showToast("Could not resolve masked link.");
          link.style.color = ""; // Reset color on API error
        }
      })
      .catch((error) => {
        if (error.type === "parse") {
          console.error("hijackMaskedLinks parse error:", error.error);
        } else {
          showToast("Failed to resolve masked link.");
        }
        link.style.color = ""; // Reset color on network fail
      })
      .finally(() => {
        void dispatchResolvedLink(targetUrl, { anchorEl: link }).catch(() => {
          window.open(targetUrl, "_blank");
        });
      });
  };

  addListener(CLICK_LISTENER_ID, document, "click", handler, { capture: true });
  addListener(AUXCLICK_LISTENER_ID, document, "auxclick", handler, { capture: true });
}

/**
 * Removes the event listeners that hijack masked links.
 */
export function disableHijackMaskedLink() {
  if (!stateManager.get("isMaskedLinkApplied")) return;
  removeListener("masked-link-click-hijack");
  removeListener("masked-link-auxclick-hijack");
  stateManager.set("isMaskedLinkApplied", false);
}
