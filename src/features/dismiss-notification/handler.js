import stateManager, { config } from "../../config.js";
import { saveConfigKeys } from "../../services/settingsService";
import { debugLog } from "../../core/logger";
import { addObserverCallback, removeObserverCallback } from "../../core/observer.js";
import { SELECTORS } from "../../config/selectors.js";
let noticeDismissHandler = null;

/**
 * The handler that implements our custom dismissal logic.
 * It saves the notice ID to persistent storage and then animates the collapse.
 * @param {MouseEvent} e
 */
function customDismissHandler(e) {
  e.preventDefault();
  e.stopImmediatePropagation();

  const notice = e.target.closest(SELECTORS.NOTICE.SELECTOR);
  if (!notice) return;

  const noticeId = notice.getAttribute("data-notice-id");
  if (noticeId) {
    saveConfigKeys({ savedNotifID: parseInt(noticeId) });
  }

  collapseNotice(notice);
}

function processNotice(notice) {
  const noticeId = notice.getAttribute("data-notice-id");
  if (!noticeId) return;

  // If already dismissed in our config, collapse it and we're done.
  if (config.savedNotifID === parseInt(noticeId)) {
    collapseNotice(notice);
    return;
  }

  // Find any existing close button (native or ours).
  let closeBtn = notice.querySelector(
    `${SELECTORS.NOTICE.DISMISS_SELECTOR}, ${SELECTORS.NOTICE.DISMISS_BTN_SELECTOR}`,
  );
  if (!closeBtn) {
    closeBtn = document.createElement("button");
    closeBtn.innerText = "×";
    closeBtn.className = SELECTORS.NOTICE.DISMISS_BTN_SELECTOR.replace(".", ""); // Our custom class
    notice.appendChild(closeBtn);
  }

  if (closeBtn.dataset.dismissHijacked) return;

  closeBtn.dataset.dismissHijacked = "true";
  closeBtn.addEventListener("click", noticeDismissHandler, { capture: true });
}

/**
 * Observer callback that processes newly added DOM nodes to find and handle notices.
 * @param {MutationRecord[]} mutationsList
 */
function processMutations(mutationsList) {
  for (const mutation of mutationsList) {
    if (mutation.type !== "childList") continue;

    for (const node of mutation.addedNodes) {
      if (node.nodeType !== 1) continue;

      if (node.classList?.contains(SELECTORS.NOTICE.CLASS)) {
        processNotice(node);
      } else {
        node.querySelectorAll?.(SELECTORS.NOTICE.SELECTOR).forEach(processNotice);
      }
    }
  }
}

function hasNoticeMutations(mutationsList) {
  return mutationsList.some((mutation) => {
    for (const node of mutation.addedNodes || []) {
      if (node.nodeType !== 1) continue;
      if (node.classList?.contains(SELECTORS.NOTICE.CLASS)) return true;
      if (node.querySelector?.(SELECTORS.NOTICE.SELECTOR)) return true;
    }
    return false;
  });
}

export function enableNoticeDismissal() {
  if (stateManager.get("isNoticeDismissalEnabled")) return; // Already enabled
  stateManager.set("isNoticeDismissalEnabled", true);

  if (!noticeDismissHandler) {
    noticeDismissHandler = customDismissHandler;
  }

  // Process any notices already on the page
  document.querySelectorAll(SELECTORS.NOTICE.SELECTOR).forEach(processNotice);

  // Observe for new notices being added to the DOM
  addObserverCallback("dismiss-notification", processMutations, {
    filter: hasNoticeMutations,
  });
  debugLog("enableNoticeDismissal", "Dismissal feature initialized and observing for new notices");
}

export function disableNoticeDismissal() {
  if (!stateManager.get("isNoticeDismissalEnabled")) return;
  stateManager.set("isNoticeDismissalEnabled", false);
  removeObserverCallback("dismiss-notification");

  if (noticeDismissHandler) {
    document
      .querySelectorAll(
        `${SELECTORS.NOTICE.DISMISS_SELECTOR}, ${SELECTORS.NOTICE.DISMISS_BTN_SELECTOR}`,
      )
      .forEach((btn) => {
        btn.removeEventListener("click", noticeDismissHandler, { capture: true });
        delete btn.dataset.dismissHijacked;
      });
    noticeDismissHandler = null;
  }

  document.querySelectorAll(SELECTORS.NOTICE.DISMISS_BTN_SELECTOR).forEach((btn) => btn.remove());

  document.querySelectorAll(SELECTORS.NOTICE.SELECTOR).forEach((notice) => {
    expandNotice(notice);
  });
  debugLog("disableNoticeDismissal", "Dismissal feature turned off");
}

function collapseNotice(notice) {
  if (!notice || notice.classList.contains("f95-is-collapsing")) return;

  // Set max-height before transition for smooth animation
  notice.style.maxHeight = notice.scrollHeight + "px";
  // Force reflow
  notice.offsetHeight;

  notice.classList.add("f95-is-collapsing");

  // After the transition, set display: none to remove it from layout flow.
  notice.addEventListener("transitionend", () => (notice.style.display = "none"), { once: true });
}

function expandNotice(notice) {
  if (!notice) return;
  notice.style.display = "";
  notice.classList.remove("f95-is-collapsing");
  notice.style.maxHeight = "";
}
