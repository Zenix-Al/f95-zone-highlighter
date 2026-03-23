import stateManager, { config } from "../../config.js";
import { showToast } from "../../ui/components/toast.js";
import { routeDownloadUrl, isSupportedDownloadLink } from "../../services/downloadRouter.js";
import { resolveMaskedLink } from "./resolver.js";
import { addListener, removeListener } from "../../core/listenerRegistry.js";
import { addObserverCallback, removeObserverCallback } from "../../core/observer.js";

const MASKED_LINK_SELECTOR = 'a[href^="/masked/"], a[href^="https://f95zone.to/masked/"]';
const RESOLVE_BUTTON_CLASS = "f95ue-masked-resolve-btn";
const RESOLVE_BUTTON_ATTR = "data-f95ue-resolve-bound";
const RESOLVE_CLICK_LISTENER_ID = "masked-link-resolve-button-click";
const MASKED_LINK_OBSERVER_ID = "masked-link-resolve-button-observer";

function isLikelyDirectDownloadAnchor(link) {
  if (!(link instanceof HTMLAnchorElement)) return false;
  const rawHref = String(link.getAttribute("href") || "")
    .trim()
    .toLowerCase();
  if (!rawHref) return false;
  if (rawHref.startsWith("#")) return false;
  if (rawHref.startsWith("javascript:")) return false;
  if (rawHref.startsWith("mailto:")) return false;
  if (rawHref.startsWith("tel:")) return false;
  if (rawHref.startsWith("/")) return false;
  if (rawHref.startsWith("./") || rawHref.startsWith("../")) return false;
  if (rawHref.includes("f95zone.to")) return false;
  return true;
}

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

// Helper functions hoisted to module scope for clarity and testability
function toAbsoluteMaskedHref(href) {
  const rawHref = String(href || "").trim();
  if (!rawHref) return "";
  if (rawHref.startsWith("/masked/")) return `https://f95zone.to${rawHref}`;
  return rawHref;
}

function createRouteButton(link, type) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = RESOLVE_BUTTON_CLASS;
  btn.dataset.linkType = type;
  if (type === "masked") {
    btn.textContent = "Resolve";
    btn.title = "Resolve masked link and route download";
    btn.dataset.maskedHref = toAbsoluteMaskedHref(link.getAttribute("href"));
  } else {
    btn.textContent = "Direct DL";
    btn.title = "Route through direct download";
    btn.dataset.directHref = link.href;
  }
  return btn;
}

function getBoundButton(link) {
  const next = link.nextElementSibling;
  if (!(next instanceof HTMLButtonElement)) return null;
  if (!next.classList.contains(RESOLVE_BUTTON_CLASS)) return null;
  return next;
}

function getDesiredButtonType(link) {
  if (config.threadSettings.skipMaskedLink && link.matches(MASKED_LINK_SELECTOR)) {
    return "masked";
  }
  if (
    config.threadSettings.directDownloadLinks &&
    isLikelyDirectDownloadAnchor(link) &&
    isSupportedDownloadLink(link.href)
  ) {
    return "direct";
  }
  return null;
}

function syncLinkButton(link) {
  if (!(link instanceof HTMLAnchorElement)) return;

  const desiredType = getDesiredButtonType(link);
  const existingButton = getBoundButton(link);

  if (!desiredType) {
    if (existingButton) existingButton.remove();
    link.removeAttribute(RESOLVE_BUTTON_ATTR);
    return;
  }

  if (existingButton && existingButton.dataset.linkType === desiredType) {
    link.setAttribute(RESOLVE_BUTTON_ATTR, "1");

    if (desiredType === "masked") {
      const maskedHref = toAbsoluteMaskedHref(link.getAttribute("href"));
      if (existingButton.dataset.maskedHref === maskedHref) return;
      existingButton.dataset.maskedHref = maskedHref;
      delete existingButton.dataset.resolvedHref;
      delete existingButton.dataset.resolved;
      existingButton.textContent = "Resolve";
      return;
    }

    existingButton.dataset.directHref = link.href;
    return;
  }

  if (existingButton) existingButton.remove();
  link.insertAdjacentElement("afterend", createRouteButton(link, desiredType));
  link.setAttribute(RESOLVE_BUTTON_ATTR, "1");
}

function collectCandidateLinks(root = document) {
  if (root instanceof HTMLAnchorElement) {
    return [root];
  }
  return root.querySelectorAll("a[href]");
}

function ensureResolveButtons(root = document) {
  collectCandidateLinks(root).forEach((link) => syncLinkButton(link));
}

function hasMaskedLinkMutations(mutationsList) {
  if (!config.threadSettings.skipMaskedLink && !config.threadSettings.directDownloadLinks) {
    return false;
  }

  return mutationsList.some((mutation) => {
    for (const node of mutation.addedNodes) {
      if (!(node instanceof Element)) continue;
      if (config.threadSettings.skipMaskedLink) {
        if (node.matches(MASKED_LINK_SELECTOR)) return true;
        if (node.querySelector(MASKED_LINK_SELECTOR)) return true;
      }
      if (config.threadSettings.directDownloadLinks) {
        if (node instanceof HTMLAnchorElement && isLikelyDirectDownloadAnchor(node)) return true;
        for (const anchor of node.querySelectorAll("a[href]")) {
          if (isLikelyDirectDownloadAnchor(anchor)) return true;
        }
      }
    }
    return false;
  });
}

function syncLinksFromMutations(mutationsList) {
  const seen = new Set();
  for (const mutation of mutationsList) {
    for (const node of mutation.addedNodes) {
      if (!(node instanceof Element)) continue;
      for (const link of collectCandidateLinks(node)) {
        if (seen.has(link)) continue;
        seen.add(link);
        syncLinkButton(link);
      }
    }
  }
}

function handleResolveClick(e) {
  const btn = e.target.closest(`.${RESOLVE_BUTTON_CLASS}`);
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();

  const link = btn.previousElementSibling;
  if (!(link instanceof HTMLAnchorElement)) return;

  // Already resolved — dispatch the cached URL immediately
  if (btn.dataset.resolvedHref) {
    void dispatchResolvedLink(btn.dataset.resolvedHref, { anchorEl: link }).catch(() => {
      window.open(btn.dataset.resolvedHref, "_blank");
    });
    return;
  }

  // Direct download link — no resolution step needed
  if (btn.dataset.linkType === "direct") {
    const directHref = btn.dataset.directHref || link.href;
    void dispatchResolvedLink(directHref, { anchorEl: link }).catch(() => {
      window.open(directHref, "_blank");
    });
    return;
  }

  const href = toAbsoluteMaskedHref(btn.dataset.maskedHref || link.getAttribute("href"));
  if (!href) return;

  const path = new URL(href).pathname;
  showToast("Resolving masked link...");
  btn.disabled = true;
  btn.textContent = "...";

  resolveMaskedLink(`https://f95zone.to${path}`)
    .then((data) => {
      if (data.status === "ok" && data.msg) {
        showToast("Masked link resolved.");
        btn.dataset.resolvedHref = normalizeResolvedUrl(data.msg, href);
        btn.dataset.resolved = "true";
      } else {
        showToast("Could not resolve masked link.");
      }
    })
    .catch((error) => {
      if (error.type === "parse") {
        console.error("resolveMaskedLink parse error:", error.error);
      } else {
        showToast("Failed to resolve masked link.");
      }
    })
    .finally(() => {
      btn.disabled = false;
      btn.textContent = btn.dataset.resolvedHref ? "Open" : "Resolve";
      if (btn.dataset.resolvedHref) {
        void dispatchResolvedLink(btn.dataset.resolvedHref, { anchorEl: link }).catch(() => {
          window.open(btn.dataset.resolvedHref, "_blank");
        });
      }
    });
}

/**
 * On thread pages, this injects Resolve/Direct-DL buttons next to links.
 */
export function hijackMaskedLinks() {
  const alreadyApplied = stateManager.get("isMaskedLinkApplied");
  if (!alreadyApplied) stateManager.set("isMaskedLinkApplied", true);

  ensureResolveButtons(document);

  if (alreadyApplied) return;

  addObserverCallback(
    MASKED_LINK_OBSERVER_ID,
    (mutationsList) => {
      syncLinksFromMutations(mutationsList);
    },
    { filter: hasMaskedLinkMutations },
  );

  addListener(RESOLVE_CLICK_LISTENER_ID, document, "click", handleResolveClick);
}

/**
 * Removes the event listeners that hijack masked links.
 */
export function disableHijackMaskedLink() {
  if (!stateManager.get("isMaskedLinkApplied")) return;
  removeListener(RESOLVE_CLICK_LISTENER_ID);
  removeObserverCallback(MASKED_LINK_OBSERVER_ID);

  document.querySelectorAll(`.${RESOLVE_BUTTON_CLASS}`).forEach((btn) => btn.remove());
  document
    .querySelectorAll(`a[${RESOLVE_BUTTON_ATTR}="1"]`)
    .forEach((link) => link.removeAttribute(RESOLVE_BUTTON_ATTR));

  stateManager.set("isMaskedLinkApplied", false);
}
