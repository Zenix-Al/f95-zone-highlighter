// TODO : refactor it to fit the project structure

import { config } from "../constants";
import { saveConfigKeys } from "../core/save";
import { debugLog } from "../core/debugOutput";

// This module manages the dismissal of notification elements on a webpage.
// It allows users to close notifications, and remembers their choices using localStorage.
export function initNoticeDismissal() {
  if (!config.globalSettings.closeNotifOnClick) return;

  const notices = document.querySelectorAll(".js-notice");

  notices.forEach((notice) => {
    const id = notice.getAttribute("data-notice-id");
    if (!id) return; // safety

    if (config.savedNotifID === parseInt(id)) {
      collapseNotice(notice);
      return;
    }

    // Don't add duplicate close buttons
    const closeBtn = document.createElement("button");
    closeBtn.innerText = "×";
    closeBtn.className = "js-notice-dismiss-btn";

    notice.appendChild(closeBtn);

    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();

      const id = notice.getAttribute("data-notice-id");
      if (id) {
        saveConfigKeys({ savedNotifID: parseInt(id) });
      }

      collapseNotice(notice);
    });
  });
  debugLog("initNoticeDismissal", "Dismissal feature initialized");
}

export function removeNoticeDismissal() {
  document.querySelectorAll(".js-notice-dismiss-btn").forEach((btn) => btn.remove());
  const notices = document.querySelectorAll(".js-notice");
  notices.forEach((notice) => {
    expandNotice(notice);
  });
  debugLog("removeNoticeDismissal", "Dismissal feature turned off — close buttons removed");
}

export function toggleNoticeDismissal() {
  if (config.globalSettings.closeNotifOnClick) {
    initNoticeDismissal();
  } else {
    removeNoticeDismissal();
  }
}

/* Helper: collapse a notice with a smooth transition so siblings move up gracefully */
function collapseNotice(notice) {
  if (!notice) return;
  // If already collapsed, bail
  if (notice.dataset._collapsed === "1") return;

  const style = window.getComputedStyle(notice);
  const height = notice.scrollHeight;

  // preserve current box spacing
  const paddingTop = style.paddingTop;
  const paddingBottom = style.paddingBottom;
  const marginBottom = style.marginBottom;

  notice.style.boxSizing = "border-box";
  notice.style.maxHeight = height + "px";
  notice.style.paddingTop = paddingTop;
  notice.style.paddingBottom = paddingBottom;
  notice.style.marginBottom = marginBottom;
  notice.style.overflow = "hidden";
  notice.style.transition =
    "opacity 0.4s ease-out, max-height 0.45s ease-out, padding 0.4s ease-out, margin 0.4s ease-out";

  // force layout so the starting max-height is applied
  notice.offsetHeight;

  // trigger collapse
  notice.style.opacity = "0";
  notice.style.maxHeight = "0";
  notice.style.paddingTop = "0";
  notice.style.paddingBottom = "0";
  notice.style.marginBottom = "0";
  notice.dataset._collapsed = "1";

  const onEnd = (e) => {
    // wait for the max-height/opacity transition to finish
    if (e.target !== notice) return;
    notice.style.display = "none";
    // cleanup inline styles we added (keep a minimal footprint)
    notice.style.removeProperty("max-height");
    notice.style.removeProperty("overflow");
    notice.style.removeProperty("transition");
    notice.style.removeProperty("padding-top");
    notice.style.removeProperty("padding-bottom");
    notice.style.removeProperty("margin-bottom");
    notice.style.removeProperty("opacity");
    delete notice.dataset._collapsed;
    notice.removeEventListener("transitionend", onEnd);
  };

  notice.addEventListener("transitionend", onEnd);
}

/* Helper: restore a notice to visible state (reverse of collapse) */
function expandNotice(notice) {
  if (!notice) return;
  // if it's already visible, ensure display
  notice.style.removeProperty("display");
  notice.style.display = "";

  // remove any collapsed flag and inline collapse styles
  notice.style.removeProperty("max-height");
  notice.style.removeProperty("overflow");
  notice.style.removeProperty("transition");
  notice.style.removeProperty("padding-top");
  notice.style.removeProperty("padding-bottom");
  notice.style.removeProperty("margin-bottom");
  notice.style.removeProperty("opacity");
  delete notice.dataset._collapsed;

  // ensure it's visible (some pages use display none defaults)
  notice.style.display = "block";
}
