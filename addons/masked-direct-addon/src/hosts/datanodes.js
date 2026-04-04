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
  const DATANODES_RETRY_DELAY = Math.max(1200, TIMINGS.DATANODES_POLL_INTERVAL * 2);
  const DATANODES_AFTER_METHOD_FREE_DELAY = Math.max(1200, TIMINGS.DATANODES_POLL_INTERVAL * 4);
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
    const isReady = await waitForReadyState();
    if (!isReady) {
      showToast("Datanodes: ready state not found — skipping free-method step.");
      return { skipped: true };
    }

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
      return { skipped: true };
    }

    if (!methodFreeButton) {
      showToast("Datanodes: free-method button missing — skipping step.");
      return { skipped: true };
    }

    stageStore.write(DATANODES_STAGE_AFTER_FREE);

    const result = await clickButtonWithRetries({
      getCandidate: getMethodFreeButton,
      maxClicks: DATANODES_MAX_FREE_CLICKS,
      delayMs: DATANODES_RETRY_DELAY,
      successToast: "Datanodes continue flow started...",
    });

    if (!result.progressed) {
      stageStore.clear();
      showToast("Datanodes: could not click continue button — skipping step.");
      return { skipped: true };
    }

    return { skipped: false };
  }

  async function runPreDownloadPhase() {
    if (stageStore.read() === DATANODES_STAGE_AFTER_FREE) {
      return;
    }

    const freeResult = await runMethodFreePhase();
    if (freeResult?.skipped) {
      return;
    }

    await sleep(DATANODES_AFTER_METHOD_FREE_DELAY);
  }

  async function runDownloadPhase() {
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
      return { skipped: true };
    }

    if (!clickActionButton(button2First)) {
      showToast("Datanodes: first download click failed — skipping.");
      return { skipped: true };
    }
    showToast("Datanodes countdown started...");

    await sleep(Math.max(1000, DATANODES_RETRY_DELAY));

    const postFirstClickButton = getConfirmPhaseDownloadButton();
    if (postFirstClickButton && hasButtonText(postFirstClickButton, "download")) {
      clickActionButton(postFirstClickButton);
    }

    await sleep(TIMINGS.DATANODES_SECOND_CLICK_DELAY);

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
      return { skipped: true };
    }

    if (!clickActionButton(button2Second)) {
      showToast("Datanodes: confirm click failed — skipping.");
      return { skipped: true };
    }
    showToast("Datanodes download triggered.");
    stageStore.clear();
    reportAddonHealthy();
    return { skipped: false };
  }

  try {
    await runPreDownloadPhase();
    await runDownloadPhase();
  } catch (error) {
    await notifyMainFailure(
      "datanodes.to",
      String(error?.message || "Datanodes automation failed."),
    );
  }
}
