// ==UserScript==
// @name         Gofile New UI Standalone Download Test
// @namespace    f95ue.local.test
// @version      0.1.0
// @description  Tests Gofile's current page-owned download action on one-file /d/ routes.
// @match        https://gofile.io/d/*
// @match        https://www.gofile.io/d/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  const LOG_PREFIX = "[gofile-standalone-test]";
  const DOWNLOAD_SELECTOR = 'button[data-action="download"]';
  const FILE_ROW_SELECTOR = '.fm-row[data-id][data-type="file"]';
  const SETTLE_MS = 600;
  const TIMEOUT_MS = 30000;

  let finished = false;
  let settleTimer = 0;

  function findDownloadButton() {
    const buttons = [...document.querySelectorAll(DOWNLOAD_SELECTOR)];

    // In Gofile's single-file view, the primary Download button is not owned
    // by a listing row. Its page listener resolves the internal file object.
    const singleFileButton = buttons.find(
      (button) => !button.closest(".fm-row[data-id]"),
    );
    if (singleFileButton) {
      return { button: singleFileButton, mode: "single-file-view" };
    }

    // Preserve the old add-on safety boundary: a folder is automated only
    // when it visibly contains exactly one downloadable file.
    const fileRows = [...document.querySelectorAll(FILE_ROW_SELECTOR)];
    if (fileRows.length !== 1) return null;

    const button = fileRows[0].querySelector(DOWNLOAD_SELECTOR);
    return button ? { button, mode: "one-file-folder" } : null;
  }

  function attemptDownload(observer) {
    if (finished) return;
    const candidate = findDownloadButton();
    if (!candidate) return;

    finished = true;
    observer.disconnect();
    clearTimeout(settleTimer);
    console.info(LOG_PREFIX, "Triggering Gofile's page-owned download action.", {
      mode: candidate.mode,
      href: location.href,
    });
    candidate.button.click();
  }

  const observer = new MutationObserver(() => {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => attemptDownload(observer), SETTLE_MS);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  settleTimer = setTimeout(() => attemptDownload(observer), SETTLE_MS);
  setTimeout(() => {
    if (finished) return;
    observer.disconnect();
    clearTimeout(settleTimer);
    const fileCount = document.querySelectorAll(FILE_ROW_SELECTOR).length;
    console.warn(LOG_PREFIX, "No safe one-file download action was found.", {
      fileCount,
      href: location.href,
    });
  }, TIMEOUT_MS);
})();
