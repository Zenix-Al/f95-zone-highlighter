import { TIMINGS, SELECTORS } from "../constants.js";
import { sleep } from "../utils.js";

export async function processGofileDownload({ showToast, notifyMainFailure, reportAddonHealthy }) {
  const waitForContentReady = (timeout = 20000) =>
    new Promise((resolve, reject) => {
      const start = Date.now();

      const check = () => {
        const loading = document.querySelector(SELECTORS.GOFILE.LOADING);
        const itemsList = document.querySelector(SELECTORS.GOFILE.ITEMS_LIST);
        const isReady =
          (!loading || getComputedStyle(loading).display === "none") &&
          itemsList &&
          itemsList.children.length > 0;

        if (isReady) {
          resolve(true);
          return;
        }
        if (Date.now() - start > timeout) {
          reject(new Error("Timeout waiting for gofile content"));
          return;
        }
        setTimeout(check, TIMINGS.POLL_INTERVAL);
      };

      check();
    });

  await waitForContentReady();
  await sleep(TIMINGS.GOFILE_POST_READY_WAIT);

  const alertEl = document.querySelector(SELECTORS.GOFILE.ALERT);
  if (alertEl && getComputedStyle(alertEl).display !== "none") {
    await notifyMainFailure("gofile.io", "Host reports file unavailable.");
    return;
  }

  const itemsList = document.querySelector(SELECTORS.GOFILE.ITEMS_LIST);
  if (!itemsList) {
    await notifyMainFailure("gofile.io", "File list not found.");
    return;
  }

  const itemElements = itemsList.querySelectorAll("[data-item-id]");
  if (itemElements.length !== 1) {
    await notifyMainFailure("gofile.io", "Automation requires exactly one file.");
    return;
  }

  const contentId = itemElements[0].getAttribute("data-item-id");
  if (!contentId) {
    await notifyMainFailure("gofile.io", "Missing content id.");
    return;
  }

  if (typeof window.downloadContent === "function") {
    window.downloadContent(contentId);
    showToast("Gofile download triggered.");
    reportAddonHealthy();
    return;
  }

  await notifyMainFailure("gofile.io", "downloadContent API unavailable.");
}
