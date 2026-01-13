// TODO : refactor it to fit the project structure

import { config } from "../constants";
import { saveConfigKeys } from "../storage/save";
import { debugLog } from "../utils/debugOutput";

// This module manages the dismissal of notification elements on a webpage.
// It allows users to close notifications, and remembers their choices using localStorage.
export function initNoticeDismissal() {
  if (!config.globalSettings.closeNotifOnClick) return;

  const notices = document.querySelectorAll(".js-notice");

  notices.forEach((notice) => {
    const id = notice.getAttribute("data-notice-id");
    if (!id) return; // safety

    if (config.savedNotifID === parseInt(id)) {
      notice.remove();
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

      notice.style.display = "none";
    });
  });
  debugLog("initNoticeDismissal", "Dismissal feature initialized");
}

export function removeNoticeDismissal() {
  document.querySelectorAll(".js-notice-dismiss-btn").forEach((btn) => btn.remove());
  const notices = document.querySelectorAll(".js-notice");
  notices.forEach((notice) => {
    notice.style.display = "block";
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
