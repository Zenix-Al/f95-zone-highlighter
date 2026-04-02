import { config } from "../../config.js";
import TIMINGS from "../../config/timings.js";
import { SELECTORS } from "../../config/selectors.js";
import { debugLog } from "../../core/logger.js";
import { showToast } from "../../ui/components/toast.js";
import { queryAllBySelectors } from "../../utils/selectorQuery.js";
import { handleDirectDownloadFailure } from "./attention.js";
import { isDirectDownloadHostEnabled } from "./hostPackages.js";
import {
  isProcessingDownloadFlowActive,
  markHostDownloadSuccess,
  scheduleDirectDownloadCompletion,
} from "./hostFlowHelpers.js";

// Datanodes is a multi-page / multi-state flow. We persist a tiny stage marker so
// a navigation triggered by the free-method form does not restart from the top.
const DATANODES_STAGE_KEY = "f95ue.datanodes.stage";
const DATANODES_STAGE_AFTER_FREE = "after_free";
const DATANODES_STAGE_MAX_AGE =
  TIMINGS.DATANODES_BUTTON_WAIT_TIMEOUT +
  Math.max(6000, TIMINGS.DATANODES_SECOND_CLICK_DELAY) +
  TIMINGS.DATANODES_AUTO_CLOSE +
  15000;

// The first step is a form-driven "method free" button that can be stubborn and
// sometimes needs a few attempts before the page transitions.
const DATANODES_MAX_FREE_CLICKS = 3;
const DATANODES_RETRY_DELAY = Math.max(1200, TIMINGS.DATANODES_POLL_INTERVAL * 2);

// After the free-method submit, the host often needs a short settle window
// before the real download button is safe to interact with.
const DATANODES_AFTER_METHOD_FREE_DELAY = Math.max(1200, TIMINGS.DATANODES_POLL_INTERVAL * 4);

// The first "download" click is fragile on datanodes. Even when the button is
// already visible, clicking it too early can fail to advance the host state.
const DATANODES_BEFORE_DOWNLOAD_CLICK_DELAY = 1000;

function isDisabled(element) {
  if (!element) return true;
  if (element.disabled) return true;
  const ariaDisabled = String(element.getAttribute("aria-disabled") || "").toLowerCase();
  return ariaDisabled === "true";
}

function isVisible(element) {
  if (!element || !element.isConnected) return false;
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
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

function isCountdownText(text) {
  return /\b\d+\s*s\b/.test(text);
}

function hasButtonText(element, text) {
  return normalizeText(element?.textContent).includes(text);
}

function getMethodFreeButton() {
  const buttons = queryAllBySelectors(SELECTORS.DATANODES.METHOD_FREE_BUTTON_CANDIDATES);
  for (const button of buttons) {
    if (!button || !button.isConnected || isDisabled(button)) continue;
    if (!isMethodFreeButton(button)) continue;
    return button;
  }
  return null;
}

function getPrimaryDownloadButton() {
  const buttons = queryAllBySelectors(SELECTORS.DATANODES.DOWNLOAD_BUTTON_PRIMARY_CANDIDATES);
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

// Datanodes can surface different controls with similar styling. We keep the
// selection rules centralized so start-phase and confirm-phase stay consistent.
function findDatanodesActionButton(matchesText) {
  const primary = getPrimaryDownloadButton();
  if (primary && matchesText(normalizeText(primary.textContent))) return primary;

  const buttons = Array.from(document.querySelectorAll("button"));
  for (const button of buttons) {
    if (!isReadyForClick(button)) continue;
    if (isMethodFreeButton(button)) continue;
    const text = normalizeText(button.textContent);
    if (!text) continue;
    if (text.includes("premium")) continue;
    if (matchesText(text)) {
      return button;
    }
  }

  return null;
}

// First click must target the real "download" state only. If we accept
// "continue" here, the host can jump to the wrong phase and desync the flow.
function getStartPhaseDownloadButton() {
  return findDatanodesActionButton((text) => text.includes("download"));
}

// After the first click, datanodes may swap the same visual button into a
// countdown / continue state. The confirm lookup intentionally accepts both.
function getConfirmPhaseDownloadButton() {
  return findDatanodesActionButton(
    (text) => text.includes("continue") || text.includes("download"),
  );
}

function hasReadyBadge() {
  const elements = document.querySelectorAll("span,div,strong,b");
  for (const el of elements) {
    if (!isVisible(el)) continue;
    const text = normalizeText(el.textContent);
    if (text === "ready") return true;
  }
  return false;
}

async function waitForReadyState(timeout = TIMINGS.DATANODES_BUTTON_WAIT_TIMEOUT) {
  if (hasReadyBadge()) return true;

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    await sleep(TIMINGS.DATANODES_POLL_INTERVAL);
    if (hasReadyBadge()) return true;
  }

  return false;
}

function clickActionButton(button) {
  if (!button || !button.isConnected) return false;

  try {
    // Use the native click directly. We previously tried submit-style fallbacks,
    // but on datanodes those could interact badly with page handlers and recurse.
    HTMLElement.prototype.click.call(button);
  } catch (error) {
    debugLog("DatanodesDownloader", "Button click failed", {
      level: "warn",
      data: { error: String(error?.message || error) },
    });
    return false;
  }

  return true;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForButton({
  getCandidate,
  interval = TIMINGS.DATANODES_POLL_INTERVAL,
  timeout = TIMINGS.DATANODES_BUTTON_WAIT_TIMEOUT,
  errorCode = "button_not_found",
  errorMessage = "Datanodes automation failed: Button not found.",
}) {
  return new Promise((resolve, reject) => {
    pollForButton({
      getCandidate,
      interval,
      timeout,
      onFound: (button) => resolve(button),
      onTimeout: () => reject(new Error(`${errorCode}::${errorMessage}`)),
    });
  });
}

async function clickButtonWithRetries({
  getCandidate,
  maxClicks,
  delayMs,
  logPrefix,
  successToast,
}) {
  let clickCount = 0;
  let missingCount = 0;

  while (clickCount < maxClicks) {
    const button = getCandidate();
    if (!button) {
      missingCount += 1;
      // If button disappears after at least one click, treat as progress/success.
      if (clickCount > 0 && missingCount >= 2) {
        return { clickCount, progressed: true };
      }
      await sleep(delayMs);
      continue;
    }

    missingCount = 0;
    const text = normalizeText(button.textContent);
    debugLog("DatanodesDownloader", `${logPrefix}: clicking button`, {
      data: { clickCount, text },
    });
    clickActionButton(button);
    clickCount += 1;

    if (successToast && clickCount === 1) {
      showToast(successToast);
    }

    await sleep(isCountdownText(text) ? Math.max(delayMs, 1500) : delayMs);
  }

  return { clickCount, progressed: clickCount > 0 };
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
  clearDatanodesStage();
  await handleDirectDownloadFailure({
    packageKey: "datanodes",
    host: "datanodes.to",
    message,
    code,
    trippedToast: "Datanodes auto-disabled after 3 consecutive failures.",
  });
}

function finishSuccess() {
  clearDatanodesStage();
  void markHostDownloadSuccess("datanodes");
  scheduleDirectDownloadCompletion("DatanodesDownloader", TIMINGS.DATANODES_AUTO_CLOSE);
}

async function runDownloadPhase() {
  debugLog("DatanodesDownloader", "Waiting for download button...");

  // Even after the page looks ready, datanodes can still reject the first
  // download click if we fire immediately. Delay first, then resolve the node,
  // so we do not keep a stale reference across the settle window.
  debugLog("DatanodesDownloader", "Settling before first button2 click...", {
    data: { delayMs: DATANODES_BEFORE_DOWNLOAD_CLICK_DELAY },
  });
  await sleep(DATANODES_BEFORE_DOWNLOAD_CLICK_DELAY);

  let button2First = null;
  try {
    button2First = await waitForButton({
      getCandidate: getStartPhaseDownloadButton,
      errorCode: "second_button_not_found",
      errorMessage: "Datanodes automation failed: Download button not found.",
    });
  } catch {
    showToast("Datanodes: download button not found — skipping download step.");
    debugLog("DatanodesDownloader", "Download button not found; skipping download phase.", {
      level: "warn",
    });
    return { skipped: true };
  }

  debugLog("DatanodesDownloader", "download-phase: first button2 click", {
    data: { text: normalizeText(button2First.textContent) },
  });
  if (!clickActionButton(button2First)) {
    showToast("Datanodes: first download click failed — skipping.");
    debugLog("DatanodesDownloader", "First download click did not trigger; skipping.", {
      level: "warn",
    });
    return { skipped: true };
  }
  showToast("Datanodes countdown started...");

  // The host sometimes throws internally on the first click and leaves the
  // button stuck at its original "download" state. Treat that as a failed
  // transition and reinforce the first click once before continuing.
  await sleep(Math.max(1000, DATANODES_RETRY_DELAY));

  const postFirstClickButton = getConfirmPhaseDownloadButton();
  const postFirstClickText = normalizeText(postFirstClickButton?.textContent);
  if (postFirstClickButton && hasButtonText(postFirstClickButton, "download")) {
    debugLog("DatanodesDownloader", "First button2 click did not advance state; retrying once.", {
      level: "warn",
      data: { text: postFirstClickText },
    });
    if (!clickActionButton(postFirstClickButton)) {
      showToast("Datanodes: retry click failed — skipping confirm step.");
      debugLog("DatanodesDownloader", "Retry of first download click did not trigger; skipping.", {
        level: "warn",
      });
      return { skipped: true };
    }
  }

  // After the first click has advanced, wait out the host-controlled cooldown
  // and reacquire the button fresh. Datanodes can replace the DOM node here.
  await sleep(TIMINGS.DATANODES_SECOND_CLICK_DELAY);

  debugLog("DatanodesDownloader", "Waiting for confirm button after countdown...");
  let button2Second = null;
  try {
    button2Second = await waitForButton({
      getCandidate: getConfirmPhaseDownloadButton,
      timeout: TIMINGS.DATANODES_BUTTON_WAIT_TIMEOUT,
      errorCode: "second_click_not_ready",
      errorMessage: "Datanodes automation failed: Confirm button not available after countdown.",
    });
  } catch {
    showToast("Datanodes: confirm button not available — skipping final step.");
    debugLog("DatanodesDownloader", "Confirm button not available; skipping.", { level: "warn" });
    return { skipped: true };
  }

  debugLog("DatanodesDownloader", "download-phase: second button2 click", {
    data: { text: normalizeText(button2Second.textContent) },
  });
  if (!clickActionButton(button2Second)) {
    showToast("Datanodes: confirm click failed — skipping.");
    debugLog("DatanodesDownloader", "Confirm download click did not trigger; skipping.", {
      level: "warn",
    });
    return { skipped: true };
  }
  showToast("Datanodes download triggered.");
  finishSuccess();
  return { skipped: false };
}

async function runMethodFreePhase() {
  debugLog("DatanodesDownloader", "Waiting for ready state...");
  const isReady = await waitForReadyState();
  if (!isReady) {
    showToast("Datanodes: ready state not found — skipping free-method step.");
    debugLog("DatanodesDownloader", "Ready state not detected; skipping method-free phase.", {
      level: "warn",
    });
    return { skipped: true };
  }

  debugLog("DatanodesDownloader", "Ready detected. Waiting for free method button...");

  let methodFreeButton = null;
  try {
    methodFreeButton = await waitForButton({
      getCandidate: getMethodFreeButton,
      interval: 100,
      errorCode: "free_not_found",
      errorMessage: "Datanodes automation failed: Continue button not found.",
    });
  } catch {
    showToast("Datanodes: free-method button not found — skipping step.");
    debugLog("DatanodesDownloader", "Free-method button not found; skipping.", { level: "warn" });
    return { skipped: true };
  }

  if (!methodFreeButton) {
    showToast("Datanodes: free-method button missing — skipping step.");
    return { skipped: true };
  }

  // Persist stage before clicking because this submit can navigate immediately,
  // and any code scheduled after the click may never run on the current page.
  writeDatanodesStage(DATANODES_STAGE_AFTER_FREE);

  const result = await clickButtonWithRetries({
    getCandidate: getMethodFreeButton,
    maxClicks: DATANODES_MAX_FREE_CLICKS,
    delayMs: DATANODES_RETRY_DELAY,
    logPrefix: "method-free-phase",
    successToast: "Datanodes continue flow started...",
  });

  if (!result.progressed) {
    clearDatanodesStage();
    showToast("Datanodes: could not click continue button — skipping step.");
    debugLog("DatanodesDownloader", "method-free click did not progress; skipping.", {
      level: "warn",
    });
    return { skipped: true };
  }

  return { skipped: false };
}

async function runPreDownloadPhase() {
  if (readDatanodesStage() === DATANODES_STAGE_AFTER_FREE) {
    debugLog("DatanodesDownloader", "Resuming after continue step.");
    return;
  }

  const freeResult = await runMethodFreePhase();
  if (freeResult?.skipped) {
    debugLog("DatanodesDownloader", "method-free phase skipped; proceeding to download phase.");
    return;
  }

  // This extra pause is separate from the button2 pre-click delay above.
  // Here we are waiting for the page itself to settle after the free-method
  // submit/navigation, not for the first download click to become safe.
  debugLog("DatanodesDownloader", "Stabilizing after method-free click...", {
    data: { delayMs: DATANODES_AFTER_METHOD_FREE_DELAY },
  });
  await sleep(DATANODES_AFTER_METHOD_FREE_DELAY);
}

export async function processDatanodesDownload() {
  const isProcessing = await isProcessingDownloadFlowActive();
  if (
    !config.threadSettings.directDownloadLinks ||
    !isProcessing ||
    !isDirectDownloadHostEnabled(location.hostname)
  )
    return;

  try {
    await runPreDownloadPhase();
    await runDownloadPhase();
  } catch (error) {
    const raw = String(error?.message || "");
    const [codePart, messagePart] = raw.split("::");
    const code = codePart && !messagePart ? "flow_failed" : codePart || "flow_failed";
    const message = messagePart || raw || "Datanodes automation failed.";
    await failFlow(message, code);
  }
}
