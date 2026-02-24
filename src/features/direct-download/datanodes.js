import { config } from "../../config.js";
import TIMINGS from "../../config/timings.js";
import { SELECTORS } from "../../config/selectors.js";
import { debugLog } from "../../core/logger.js";
import { showToast } from "../../ui/components/toast.js";
import { publishDirectDownloadAttention } from "./attention.js";
import { isDirectDownloadHostEnabled } from "./hostPackages.js";
import {
  clearProcessingAndTryCloseTab,
  clearProcessingDownloadFlag,
} from "./hostFlowHelpers.js";

const DATANODES_STAGE_KEY = "f95ue.datanodes.stage";
const DATANODES_STAGE_AFTER_FREE = "after_free";
const DATANODES_STAGE_MAX_AGE =
  TIMINGS.DATANODES_BUTTON_WAIT_TIMEOUT +
  Math.max(6000, TIMINGS.DATANODES_SECOND_CLICK_DELAY) +
  TIMINGS.DATANODES_AUTO_CLOSE +
  15000;

function isDisabled(element) {
  if (!element) return true;
  if (element.disabled) return true;
  const ariaDisabled = String(element.getAttribute("aria-disabled") || "").toLowerCase();
  return ariaDisabled === "true";
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function clearDatanodesStage() {
  try {
    sessionStorage.removeItem(DATANODES_STAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

function readDatanodesStage() {
  try {
    const raw = sessionStorage.getItem(DATANODES_STAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      clearDatanodesStage();
      return null;
    }
    if (parsed.stage !== DATANODES_STAGE_AFTER_FREE || typeof parsed.ts !== "number") {
      clearDatanodesStage();
      return null;
    }
    if (Date.now() - parsed.ts > DATANODES_STAGE_MAX_AGE) {
      clearDatanodesStage();
      return null;
    }
    return parsed.stage;
  } catch {
    clearDatanodesStage();
    return null;
  }
}

function writeDatanodesStage(stage) {
  try {
    sessionStorage.setItem(
      DATANODES_STAGE_KEY,
      JSON.stringify({
        stage,
        ts: Date.now(),
      }),
    );
  } catch {
    // ignore storage errors
  }
}

function isMethodFreeButton(element) {
  if (!element) return false;
  return (
    element.id === SELECTORS.DATANODES.METHOD_FREE_BUTTON_ID ||
    String(element.getAttribute("name") || "").toLowerCase() === "method_free"
  );
}

function isPrimaryDownloadButton(element) {
  if (!element || !element.isConnected || isDisabled(element)) return false;
  if (isMethodFreeButton(element)) return false;
  const text = normalizeText(element.textContent);
  if (!text.includes("download")) return false;
  if (text.includes("premium")) return false;
  return true;
}

function getMethodFreeButton() {
  const button = document.getElementById(SELECTORS.DATANODES.METHOD_FREE_BUTTON_ID);
  if (!button || !button.isConnected || isDisabled(button)) return null;
  return button;
}

function getPrimaryDownloadButton() {
  const buttons = Array.from(document.querySelectorAll(SELECTORS.DATANODES.DOWNLOAD_BUTTON_PRIMARY));
  for (const button of buttons) {
    if (isPrimaryDownloadButton(button)) {
      return button;
    }
  }
  return null;
}

function isReadyForClick(element) {
  return Boolean(element && element.isConnected && !isDisabled(element));
}

function getSecondPhaseDownloadButton() {
  const primary = getPrimaryDownloadButton();
  if (primary) return primary;

  const buttons = Array.from(document.querySelectorAll("button"));
  for (const button of buttons) {
    if (!isReadyForClick(button)) continue;
    if (isMethodFreeButton(button)) continue;
    const text = normalizeText(button.textContent);
    if (!text) continue;
    if (text.includes("premium")) continue;
    if (
      text.includes("download") ||
      text.includes("continue") ||
      text.includes("get link") ||
      text.includes("create link")
    ) {
      return button;
    }
  }

  return null;
}

function pollForButton({
  getCandidate,
  interval = TIMINGS.DATANODES_POLL_INTERVAL,
  timeout = TIMINGS.DATANODES_BUTTON_WAIT_TIMEOUT,
  onFound,
  onTimeout,
}) {
  let done = false;
  const startedAt = Date.now();

  const finish = () => {
    if (done) return;
    done = true;
    clearInterval(intervalId);
    clearTimeout(safetyTimeout);
  };

  const intervalId = setInterval(() => {
    if (done) return;
    const candidate = getCandidate();
    if (candidate) {
      finish();
      onFound(candidate);
      return;
    }
    if (Date.now() - startedAt >= timeout) {
      finish();
      onTimeout();
    }
  }, interval);

  const safetyTimeout = setTimeout(() => {
    if (done) return;
    finish();
    onTimeout();
  }, timeout + interval);

  return finish;
}

async function failFlow(message, code = "flow_failed") {
  debugLog("DatanodesDownloader", message, { level: "warn" });
  showToast(message);
  clearDatanodesStage();
  await publishDirectDownloadAttention("datanodes.to", message, code);
  await clearProcessingDownloadFlag();
}

function finishSuccess() {
  clearDatanodesStage();
  setTimeout(() => {
    void clearProcessingAndTryCloseTab();
  }, TIMINGS.DATANODES_AUTO_CLOSE);
}

function clickSecondDownloadButton(previousButton) {
  if (isReadyForClick(previousButton)) {
    previousButton.click();
    showToast("Datanodes download triggered.");
    finishSuccess();
    return;
  }

  const immediateCandidate = getSecondPhaseDownloadButton();

  if (immediateCandidate) {
    immediateCandidate.click();
    showToast("Datanodes download triggered.");
    finishSuccess();
    return;
  }

  debugLog("DatanodesDownloader", "Second download button not ready yet. Waiting...");
  pollForButton({
    getCandidate: getSecondPhaseDownloadButton,
    interval: TIMINGS.DATANODES_POLL_INTERVAL,
    timeout: TIMINGS.DATANODES_BUTTON_WAIT_TIMEOUT,
    onFound: (secondDownloadButton) => {
      secondDownloadButton.click();
      showToast("Datanodes download triggered.");
      finishSuccess();
    },
    onTimeout: () => {
      void failFlow("Datanodes automation failed: Second download button not found.", "second_button_not_found");
    },
  });
}

function startDownloadPhase() {
  debugLog("DatanodesDownloader", "Free method selected. Waiting for primary download button...");
  pollForButton({
    getCandidate: getPrimaryDownloadButton,
    interval: TIMINGS.DATANODES_POLL_INTERVAL,
    timeout: TIMINGS.DATANODES_BUTTON_WAIT_TIMEOUT,
    onFound: (firstDownloadButton) => {
      firstDownloadButton.click();
      showToast("Datanodes free countdown started...");
      const secondClickDelay = Math.max(6000, TIMINGS.DATANODES_SECOND_CLICK_DELAY);
      setTimeout(() => {
        clickSecondDownloadButton(firstDownloadButton);
      }, secondClickDelay);
    },
    onTimeout: () => {
      void failFlow("Datanodes automation failed: Download button not found.", "button_not_found");
    },
  });
}

function startMethodFreePhase() {
  debugLog("DatanodesDownloader", "Waiting for free method button...");
  pollForButton({
    getCandidate: getMethodFreeButton,
    interval: 100,
    timeout: TIMINGS.DATANODES_BUTTON_WAIT_TIMEOUT,
    onFound: (methodFreeButton) => {
      writeDatanodesStage(DATANODES_STAGE_AFTER_FREE);
      debugLog("DatanodesDownloader", "Free method clicked. Waiting for download state...");
      methodFreeButton.click();
      setTimeout(() => {
        if (readDatanodesStage() === DATANODES_STAGE_AFTER_FREE) {
          startDownloadPhase();
        }
      }, TIMINGS.DATANODES_POLL_INTERVAL);
    },
    onTimeout: () => {
      void failFlow("Datanodes automation failed: Free method button not found.", "free_not_found");
    },
  });
}

export function processDatanodesDownload() {
  if (
    !config.threadSettings.directDownloadLinks ||
    !config.processingDownload ||
    !isDirectDownloadHostEnabled(location.hostname)
  )
    return;

  if (readDatanodesStage() === DATANODES_STAGE_AFTER_FREE) {
    debugLog("DatanodesDownloader", "Resuming after free submit.");
    startDownloadPhase();
    return;
  }

  startMethodFreePhase();
}
