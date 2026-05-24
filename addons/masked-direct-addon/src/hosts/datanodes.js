import {
  DATANODES_STAGE_AFTER_FREE,
  DATANODES_STAGE_KEY,
  TIMINGS,
  SELECTORS,
} from "../constants.js";
import { queryAllBySelectors, sleep } from "../utils.js";

const DATANODES_STAGE_MAX_AGE =
  TIMINGS.DATANODES_BUTTON_WAIT_TIMEOUT +
  Math.max(6000, TIMINGS.DATANODES_SECOND_CLICK_DELAY) +
  19000;

export function createDatanodesStageStore() {
  function clear() {
    try {
      sessionStorage.removeItem(DATANODES_STAGE_KEY);
    } catch {
      // noop
    }
  }

  function read() {
    try {
      const raw = sessionStorage.getItem(DATANODES_STAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        clear();
        return null;
      }
      if (parsed.stage !== DATANODES_STAGE_AFTER_FREE || typeof parsed.ts !== "number") {
        clear();
        return null;
      }
      if (Date.now() - parsed.ts > DATANODES_STAGE_MAX_AGE) {
        clear();
        return null;
      }
      return DATANODES_STAGE_AFTER_FREE;
    } catch {
      clear();
      return null;
    }
  }

  function write(stage) {
    try {
      sessionStorage.setItem(DATANODES_STAGE_KEY, JSON.stringify({ stage, ts: Date.now() }));
    } catch {
      // noop
    }
  }

  return { read, write, clear };
}

export async function processDatanodesDownload({
  showToast,
  notifyMainFailure,
  reportAddonHealthy,
  stageStore,
}) {
  console.info("Starting datanodes.to download flow...");
  const DATANODES_MAX_FREE_CLICKS = 3;
  const DATANODES_RETRY_DELAY = Math.max(5000, TIMINGS.DATANODES_POLL_INTERVAL);
  const DATANODES_AFTER_METHOD_FREE_DELAY = Math.max(5000, TIMINGS.DATANODES_POLL_INTERVAL);
  const DATANODES_BEFORE_DOWNLOAD_CLICK_DELAY = 1000;
  const DATANODES_PROCESS_MAX_TIMEOUT = 40000; // 40 second safety timeout for entire process
  const PROCESS_START_TIME = Date.now();

  function checkTimeoutExceeded(label) {
    const elapsed = Date.now() - PROCESS_START_TIME;
    if (elapsed > DATANODES_PROCESS_MAX_TIMEOUT) {
      throw new Error(
        `timeout::Datanodes automation exceeded ${DATANODES_PROCESS_MAX_TIMEOUT}ms timeout at ${label}.`,
      );
    }
  }

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

  function isReadyForClick(element) {
    return Boolean(element && element.isConnected && !isDisabled(element));
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

  function getStartPhaseDownloadButton() {
    return findDatanodesActionButton((text) => text.includes("download"));
  }

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

  async function waitForButton({
    getCandidate,
    interval = TIMINGS.DATANODES_POLL_INTERVAL,
    timeout = TIMINGS.DATANODES_BUTTON_WAIT_TIMEOUT,
    errorCode = "button_not_found",
    errorMessage = "Datanodes automation failed: Button not found.",
  }) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      const candidate = getCandidate();
      if (candidate) return candidate;
      await sleep(interval);
    }
    throw new Error(`${errorCode}::${errorMessage}`);
  }

  function clickActionButton(button) {
    if (!button || !button.isConnected) return false;
    try {
      HTMLElement.prototype.click.call(button);
    } catch {
      return false;
    }
    return true;
  }

  async function clickButtonWithRetries({ getCandidate, maxClicks, delayMs, successToast }) {
    let clickCount = 0;
    let missingCount = 0;
    while (clickCount < maxClicks) {
      const button = getCandidate();
      if (!button) {
        missingCount += 1;
        if (clickCount > 0 && missingCount >= 2) {
          return { clickCount, progressed: true };
        }
        await sleep(delayMs);
        continue;
      }
      missingCount = 0;
      const text = normalizeText(button.textContent);
      clickActionButton(button);
      clickCount += 1;
      if (successToast && clickCount === 1) {
        showToast(successToast);
      }
      await sleep(isCountdownText(text) ? Math.max(delayMs, 1500) : delayMs);
    }
    return { clickCount, progressed: clickCount > 0 };
  }

  async function runMethodFreePhase() {
    console.info("[Datanodes] Waiting for ready state badge...");
    const isReady = await waitForReadyState();
    if (!isReady) {
      console.warn("[Datanodes] Ready state badge not found");
      showToast("Datanodes: ready state not found — skipping free-method step.");
      return { skipped: true };
    }
    console.info("[Datanodes] Ready state badge found");
    checkTimeoutExceeded("runMethodFreePhase_ready_badge");

    let methodFreeButton = null;
    try {
      console.info("[Datanodes] Searching for free-method button...");
      methodFreeButton = await waitForButton({
        getCandidate: getMethodFreeButton,
        interval: 100,
        errorCode: "free_not_found",
        errorMessage: "Datanodes automation failed: Continue button not found.",
      });
    } catch {
      console.warn("[Datanodes] Free-method button not found");
      showToast("Datanodes: free-method button not found — skipping step.");
      return { skipped: true };
    }

    if (!methodFreeButton) {
      console.warn("[Datanodes] Free-method button is null");
      showToast("Datanodes: free-method button missing — skipping step.");
      return { skipped: true };
    }
    console.info("[Datanodes] Free-method button found, starting clicks...");
    checkTimeoutExceeded("runMethodFreePhase_button_found");

    stageStore.write(DATANODES_STAGE_AFTER_FREE);

    const result = await clickButtonWithRetries({
      getCandidate: getMethodFreeButton,
      maxClicks: DATANODES_MAX_FREE_CLICKS,
      delayMs: DATANODES_RETRY_DELAY,
      successToast: "Datanodes continue flow started...",
    });

    if (!result.progressed) {
      console.warn("[Datanodes] Failed to click method-free button");
      stageStore.clear();
      showToast("Datanodes: could not click continue button — skipping step.");
      return { skipped: true };
    }
    console.info("[Datanodes] Method-free phase completed successfully");
    checkTimeoutExceeded("runMethodFreePhase_complete");

    return { skipped: false };
  }

  async function runPreDownloadPhase() {
    console.info("[Datanodes] Starting pre-download phase...");
    checkTimeoutExceeded("runPreDownloadPhase_start");

    // Check if we're in a resumed state from a previous attempt
    const resumeStage = stageStore.read();
    if (resumeStage === DATANODES_STAGE_AFTER_FREE) {
      console.info("[Datanodes] Resuming from previous free-method phase, skipping to download...");
      return;
    }

    console.info("[Datanodes] Running method-free phase...");
    const freeResult = await runMethodFreePhase();
    checkTimeoutExceeded("runMethodFreePhase_complete");

    if (freeResult?.skipped) {
      console.info(
        "[Datanodes] Method-free phase was skipped, proceeding to download phase anyway...",
      );
      return;
    }

    console.info("[Datanodes] Method-free phase completed, waiting before download phase...");
    await sleep(DATANODES_AFTER_METHOD_FREE_DELAY);
  }

  async function runDownloadPhase() {
    console.info("[Datanodes] Starting download phase...");
    checkTimeoutExceeded("runDownloadPhase_start");

    await sleep(DATANODES_BEFORE_DOWNLOAD_CLICK_DELAY);

    let button2First = null;
    try {
      console.info("[Datanodes] Waiting for first download button...");
      button2First = await waitForButton({
        getCandidate: getStartPhaseDownloadButton,
        errorCode: "second_button_not_found",
        errorMessage: "Datanodes automation failed: Download button not found.",
      });
    } catch {
      console.warn("[Datanodes] First download button not found");
      showToast("Datanodes: download button not found — skipping download step.");
      return { skipped: true };
    }

    if (!clickActionButton(button2First)) {
      console.warn("[Datanodes] Failed to click first download button");
      showToast("Datanodes: first download click failed — skipping.");
      return { skipped: true };
    }
    console.info("[Datanodes] First download click successful, countdown phase started");
    showToast("Datanodes countdown started...");

    await sleep(Math.max(1000, DATANODES_RETRY_DELAY));
    checkTimeoutExceeded("runDownloadPhase_after_first_click");

    const postFirstClickButton = getConfirmPhaseDownloadButton();
    if (postFirstClickButton && hasButtonText(postFirstClickButton, "download")) {
      console.info("[Datanodes] Clicking secondary download button...");
      clickActionButton(postFirstClickButton);
    }

    await sleep(TIMINGS.DATANODES_SECOND_CLICK_DELAY);
    checkTimeoutExceeded("runDownloadPhase_before_confirm_wait");

    let button2Second = null;
    try {
      console.info("[Datanodes] Waiting for confirm button after countdown...");
      button2Second = await waitForButton({
        getCandidate: getConfirmPhaseDownloadButton,
        timeout: TIMINGS.DATANODES_BUTTON_WAIT_TIMEOUT,
        errorCode: "second_click_not_ready",
        errorMessage: "Datanodes automation failed: Confirm button not available after countdown.",
      });
    } catch {
      console.warn("[Datanodes] Confirm button not available after countdown");
      showToast("Datanodes: confirm button not available — skipping final step.");
      return { skipped: true };
    }

    if (!clickActionButton(button2Second)) {
      console.warn("[Datanodes] Failed to click confirm button");
      showToast("Datanodes: confirm click failed — skipping.");
      return { skipped: true };
    }
    checkTimeoutExceeded("runDownloadPhase_after_confirm_click");

    console.info("[Datanodes] Download triggered successfully!");
    showToast("Datanodes download triggered.");
    stageStore.clear();
    reportAddonHealthy();
    return { skipped: false };
  }

  try {
    console.info("[Datanodes] Process started, timeout: " + DATANODES_PROCESS_MAX_TIMEOUT + "ms");
    await runPreDownloadPhase();
    checkTimeoutExceeded("after_runPreDownloadPhase");
    await runDownloadPhase();
    console.info("[Datanodes] Process completed successfully");
  } catch (error) {
    const errorStr = String(error?.message || "Datanodes automation failed");
    console.error("[Datanodes] Process failed:", errorStr);

    // Extract error code if in format "code::message"
    const parts = errorStr.split("::");
    const errorCode = parts.length > 1 ? parts[0] : "unknown";
    const errorMessage = parts.length > 1 ? parts.slice(1).join("::") : errorStr;

    // Don't notify if timeout occurred (script was interrupted)
    if (errorCode !== "timeout") {
      await notifyMainFailure("datanodes.to", errorMessage);
    } else {
      showToast("Datanodes: automation process exceeded maximum timeout.");
      console.error("[Datanodes] Process timeout exceeded at: " + errorMessage);
    }
  }
}
