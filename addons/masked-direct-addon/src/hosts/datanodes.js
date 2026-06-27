import {
  DATANODES_STAGE_AFTER_FREE,
  DATANODES_STAGE_KEY,
  TIMINGS,
  SELECTORS,
} from "../constants.js";
import { queryAllBySelectors, sleep } from "../utils.js";

const DATANODES_STAGE_MAX_AGE =
  TIMINGS.DATANODES_TOTAL_FLOW_TIMEOUT + TIMINGS.DATANODES_SKIPPED_STEP_SETTLE_DELAY;

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

function getDatanodesTiming(settings = {}) {
  const datanodes = settings?.directDownload?.datanodes || settings?.datanodes || {};

  function numberValue(key, fallback) {
    const value = Number(datanodes[key]);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  }

  function booleanValue(key, fallback) {
    const value = datanodes[key];
    return typeof value === "boolean" ? value : fallback;
  }

  return {
    pollInterval: numberValue("pollInterval", TIMINGS.DATANODES_POLL_INTERVAL || 250),
    totalFlowTimeout: numberValue(
      "totalFlowTimeout",
      TIMINGS.DATANODES_TOTAL_FLOW_TIMEOUT || 90000,
    ),
    pageReadyWaitTimeout: numberValue(
      "pageReadyWaitTimeout",
      TIMINGS.DATANODES_PAGE_READY_WAIT_TIMEOUT || 30000,
    ),
    pageReadySettleDelay: numberValue(
      "pageReadySettleDelay",
      TIMINGS.DATANODES_PAGE_READY_SETTLE_DELAY || 1200,
    ),
    methodFreePreWait: numberValue(
      "methodFreePreWait",
      TIMINGS.DATANODES_METHOD_FREE_PRE_WAIT || 500,
    ),
    methodFreeWaitTimeout: numberValue(
      "methodFreeWaitTimeout",
      TIMINGS.DATANODES_METHOD_FREE_WAIT_TIMEOUT || 25000,
    ),
    methodFreeFoundSettleDelay: numberValue(
      "methodFreeFoundSettleDelay",
      TIMINGS.DATANODES_METHOD_FREE_FOUND_SETTLE_DELAY || 700,
    ),
    methodFreeAfterClickDelay: numberValue(
      "methodFreeAfterClickDelay",
      TIMINGS.DATANODES_METHOD_FREE_AFTER_CLICK_DELAY || 5000,
    ),
    methodFreeMaxClicks: numberValue(
      "methodFreeMaxClicks",
      TIMINGS.DATANODES_METHOD_FREE_MAX_CLICKS || 3,
    ),
    downloadPreWait: numberValue("downloadPreWait", TIMINGS.DATANODES_DOWNLOAD_PRE_WAIT || 1000),
    downloadWaitTimeout: numberValue(
      "downloadWaitTimeout",
      TIMINGS.DATANODES_DOWNLOAD_WAIT_TIMEOUT || 25000,
    ),
    downloadFoundSettleDelay: numberValue(
      "downloadFoundSettleDelay",
      TIMINGS.DATANODES_DOWNLOAD_FOUND_SETTLE_DELAY || 700,
    ),
    downloadAfterClickDelay: numberValue(
      "downloadAfterClickDelay",
      TIMINGS.DATANODES_DOWNLOAD_AFTER_CLICK_DELAY || 5000,
    ),
    secondaryDownloadEnabled: booleanValue(
      "secondaryDownloadEnabled",
      TIMINGS.DATANODES_SECONDARY_DOWNLOAD_ENABLED ?? true,
    ),
    secondaryDownloadPreWait: numberValue(
      "secondaryDownloadPreWait",
      TIMINGS.DATANODES_SECONDARY_DOWNLOAD_PRE_WAIT || 7000,
    ),
    secondaryDownloadFoundSettleDelay: numberValue(
      "secondaryDownloadFoundSettleDelay",
      TIMINGS.DATANODES_SECONDARY_DOWNLOAD_FOUND_SETTLE_DELAY || 500,
    ),
    secondaryDownloadAfterClickDelay: numberValue(
      "secondaryDownloadAfterClickDelay",
      TIMINGS.DATANODES_SECONDARY_DOWNLOAD_AFTER_CLICK_DELAY || 1000,
    ),
    confirmPreWait: numberValue("confirmPreWait", TIMINGS.DATANODES_CONFIRM_PRE_WAIT || 7000),
    confirmWaitTimeout: numberValue(
      "confirmWaitTimeout",
      TIMINGS.DATANODES_CONFIRM_WAIT_TIMEOUT || 30000,
    ),
    confirmFoundSettleDelay: numberValue(
      "confirmFoundSettleDelay",
      TIMINGS.DATANODES_CONFIRM_FOUND_SETTLE_DELAY || 700,
    ),
    confirmAfterClickDelay: numberValue(
      "confirmAfterClickDelay",
      TIMINGS.DATANODES_CONFIRM_AFTER_CLICK_DELAY || 1000,
    ),
    skippedStepSettleDelay: numberValue(
      "skippedStepSettleDelay",
      TIMINGS.DATANODES_SKIPPED_STEP_SETTLE_DELAY || 1500,
    ),
  };
}

export async function processDatanodesDownload({
  showToast,
  notifyMainFailure,
  reportAddonHealthy,
  stageStore,
  settings = {},
}) {
  console.info("Starting datanodes.to download flow...");

  const timing = getDatanodesTiming(settings);
  const flowStartedAt = Date.now();

  function checkTimeoutExceeded(stage) {
    if (Date.now() - flowStartedAt > timing.totalFlowTimeout) {
      throw new Error(
        `timeout::Datanodes automation exceeded ${timing.totalFlowTimeout}ms timeout at ${stage}.`,
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

  function hasDatanodesProgressComplete() {
    const candidates = document.querySelectorAll(
      [
        "[aria-valuenow]",
        "[role='progressbar']",
        "progress",
        ".progress",
        ".progress-bar",
        "[class*='progress']",
        "[class*='percent']",
        "span",
        "div",
        "strong",
        "b",
      ].join(","),
    );

    for (const el of candidates) {
      if (!isVisible(el)) continue;

      const text = normalizeText(el.textContent);
      const ariaValue = Number(el.getAttribute("aria-valuenow") || NaN);
      const value = Number(el.getAttribute("value") || NaN);
      const max = Number(el.getAttribute("max") || NaN);

      if (text.includes("100%")) return true;
      if (text === "ready") return true;
      if (Number.isFinite(ariaValue) && ariaValue >= 100) return true;
      if (Number.isFinite(value) && Number.isFinite(max) && max > 0 && value >= max) return true;
    }

    return false;
  }

  async function waitForDatanodesSoftReady() {
    console.info("[Datanodes] Waiting for soft ready signal.");

    const startedAt = Date.now();
    while (Date.now() - startedAt < timing.pageReadyWaitTimeout) {
      if (
        hasReadyBadge() ||
        hasDatanodesProgressComplete() ||
        getMethodFreeButton() ||
        getStartPhaseDownloadButton()
      ) {
        console.info("[Datanodes] Soft ready signal detected.");
        if (timing.pageReadySettleDelay > 0) {
          await sleep(timing.pageReadySettleDelay);
        }
        return true;
      }

      await sleep(timing.pollInterval);
    }

    console.info("[Datanodes] Soft ready signal not found. Continuing anyway.");
    return false;
  }

  async function waitForCandidate({
    label,
    getCandidate,
    timeout,
    interval,
    preWait = 0,
    foundSettleDelay = 0,
  }) {
    if (preWait > 0) {
      console.info(`[Datanodes] ${label}: pre-wait ${preWait}ms.`);
      await sleep(preWait);
    }

    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      const candidate = getCandidate();

      if (candidate) {
        console.info(`[Datanodes] ${label}: candidate found.`);
        if (foundSettleDelay > 0) {
          await sleep(foundSettleDelay);
        }
        return candidate;
      }

      await sleep(interval);
    }

    console.info(`[Datanodes] ${label}: candidate not found after ${timeout}ms.`);
    return null;
  }

  async function settleAfterSkippedStep(reason) {
    console.info("[Datanodes] Step skipped intentionally:", reason);
    showToast(`Datanodes: ${reason.replace(/_/g, " ")}; continuing.`, 2600);

    if (timing.skippedStepSettleDelay > 0) {
      await sleep(timing.skippedStepSettleDelay);
    }

    return {
      skipped: true,
      reason,
    };
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
    console.info("[Datanodes] Starting method-free phase.");

    await waitForDatanodesSoftReady();
    checkTimeoutExceeded("runMethodFreePhase_after_soft_ready");

    const methodFreeButton = await waitForCandidate({
      label: "method_free",
      getCandidate: getMethodFreeButton,
      timeout: timing.methodFreeWaitTimeout,
      interval: timing.pollInterval,
      preWait: timing.methodFreePreWait,
      foundSettleDelay: timing.methodFreeFoundSettleDelay,
    });

    if (!methodFreeButton) {
      return settleAfterSkippedStep("method_free_missing");
    }

    stageStore.write(DATANODES_STAGE_AFTER_FREE);

    const result = await clickButtonWithRetries({
      getCandidate: getMethodFreeButton,
      maxClicks: timing.methodFreeMaxClicks,
      delayMs: timing.methodFreeAfterClickDelay,
      successToast: "Datanodes continue flow started...",
    });

    if (!result.progressed) {
      stageStore.clear();
      return settleAfterSkippedStep("method_free_click_failed");
    }

    console.info("[Datanodes] Method-free phase completed.");
    checkTimeoutExceeded("runMethodFreePhase_complete");

    return { skipped: false };
  }

  async function runPreDownloadPhase() {
    console.info("[Datanodes] Starting pre-download phase.");
    checkTimeoutExceeded("runPreDownloadPhase_start");

    const resumeStage = stageStore.read();
    if (resumeStage === DATANODES_STAGE_AFTER_FREE) {
      console.info("[Datanodes] Resuming from previous method-free phase.");
      return;
    }

    const result = await runMethodFreePhase();
    checkTimeoutExceeded("runMethodFreePhase_complete");

    if (result?.skipped) {
      console.info("[Datanodes] Method-free phase skipped intentionally:", result.reason);
      return;
    }

    if (timing.methodFreeAfterClickDelay > 0) {
      console.info("[Datanodes] Waiting after method-free phase:", timing.methodFreeAfterClickDelay);
      await sleep(timing.methodFreeAfterClickDelay);
    }
  }

  async function runOptionalSecondaryDownloadPhase() {
    console.info("[Datanodes] Starting optional secondary-download phase.");

    const secondaryButton = await waitForCandidate({
      label: "secondary_download_button",
      getCandidate: () => {
        const button = getConfirmPhaseDownloadButton();
        return button && hasButtonText(button, "download") ? button : null;
      },
      timeout: Math.max(1000, timing.secondaryDownloadPreWait),
      interval: timing.pollInterval,
      preWait: 0,
      foundSettleDelay: timing.secondaryDownloadFoundSettleDelay,
    });

    if (!secondaryButton) {
      console.info("[Datanodes] Optional secondary-download button not found. Continuing.");
      return {
        skipped: true,
        reason: "secondary_download_missing",
      };
    }

    clickActionButton(secondaryButton);

    if (timing.secondaryDownloadAfterClickDelay > 0) {
      await sleep(timing.secondaryDownloadAfterClickDelay);
    }

    return {
      skipped: false,
    };
  }

  async function runDownloadPhase() {
    console.info("[Datanodes] Starting download phase.");
    checkTimeoutExceeded("runDownloadPhase_start");

    const firstDownloadButton = await waitForCandidate({
      label: "first_download_button",
      getCandidate: getStartPhaseDownloadButton,
      timeout: timing.downloadWaitTimeout,
      interval: timing.pollInterval,
      preWait: timing.downloadPreWait,
      foundSettleDelay: timing.downloadFoundSettleDelay,
    });

    if (!firstDownloadButton) {
      return settleAfterSkippedStep("first_download_button_missing");
    }

    if (!clickActionButton(firstDownloadButton)) {
      return settleAfterSkippedStep("first_download_click_failed");
    }

    console.info("[Datanodes] First download button clicked.");
    showToast("Datanodes countdown started...");

    if (timing.downloadAfterClickDelay > 0) {
      await sleep(timing.downloadAfterClickDelay);
    }

    checkTimeoutExceeded("runDownloadPhase_after_first_click");

    if (timing.secondaryDownloadEnabled) {
      await runOptionalSecondaryDownloadPhase();
    }

    const confirmButton = await waitForCandidate({
      label: "confirm_button",
      getCandidate: getConfirmPhaseDownloadButton,
      timeout: timing.confirmWaitTimeout,
      interval: timing.pollInterval,
      preWait: timing.confirmPreWait,
      foundSettleDelay: timing.confirmFoundSettleDelay,
    });

    if (!confirmButton) {
      return settleAfterSkippedStep("confirm_button_missing");
    }

    if (!clickActionButton(confirmButton)) {
      return settleAfterSkippedStep("confirm_click_failed");
    }

    if (timing.confirmAfterClickDelay > 0) {
      await sleep(timing.confirmAfterClickDelay);
    }

    console.info("[Datanodes] Confirm button clicked. Download should be triggered.");
    stageStore.clear();
    reportAddonHealthy();

    return {
      skipped: false,
    };
  }

  console.info("[Datanodes] Timing config:", timing);

  try {
    await runPreDownloadPhase();
    checkTimeoutExceeded("after_runPreDownloadPhase");

    await runDownloadPhase();
    checkTimeoutExceeded("after_runDownloadPhase");

    console.info("[Datanodes] Flow ended.");
  } catch (error) {
    const message = String(error?.message || "Datanodes automation failed");
    console.error("[Datanodes] Process failed:", message);

    const parts = message.split("::");
    const code = parts.length > 1 ? parts[0] : "unknown";
    const detail = parts.length > 1 ? parts.slice(1).join("::") : message;

    if (code === "timeout") {
      showToast("Datanodes: automation process exceeded maximum timeout.");
      console.error("[Datanodes] Timeout detail:", detail);
      return;
    }

    await notifyMainFailure("datanodes.to", detail);
  }
}
