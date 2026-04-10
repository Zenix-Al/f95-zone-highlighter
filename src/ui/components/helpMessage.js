import stateManager, { helpMessages, config } from "../../config.js";
import { debugLog } from "../../core/logger.js";

let helpMsgInterval = null;

function isHelpMessageDisabled() {
  return config?.globalSettings?.disableHelpMessage === true;
}

function setHintTextVisibility(visible) {
  const shadowRoot = stateManager.get("shadowRoot");
  if (!shadowRoot) return;
  const hintText = shadowRoot.querySelector(".modal-footer-hint .hint-text");
  if (!hintText) return;
  hintText.style.display = visible ? "" : "none";
}

function setupHelpMessageButtons() {
  const shadowRoot = stateManager.get("shadowRoot");
  if (!shadowRoot) return;

  const feedbackBtn = shadowRoot.querySelector(".modal-footer-hint-feedback");

  if (feedbackBtn && feedbackBtn.dataset.bound !== "1") {
    feedbackBtn.dataset.bound = "1";
    feedbackBtn.addEventListener("click", () => {
      const url = "https://f95zone.to/threads/f95zone-latest.250836/";
      window.open(url, "_blank");
    });
  }
}

function getRandomStupidHelpMsg() {
  const randomIndex = Math.floor(Math.random() * helpMessages.length);
  return helpMessages[randomIndex];
}

export function startHelpMessageCycle() {
  if (isHelpMessageDisabled()) {
    setHintTextVisibility(false);
    if (helpMsgInterval) {
      clearInterval(helpMsgInterval);
      helpMsgInterval = null;
    }
    return;
  }

  setHintTextVisibility(true);
  setupHelpMessageButtons();
  const msg = getRandomStupidHelpMsg();
  debugLog("getRandomStupidHelpMsg", `Selected help message: ${msg}`);
  const hintSpan = stateManager.get("shadowRoot").querySelector(".modal-footer-hint .hint-text");
  if (hintSpan) {
    hintSpan.textContent = msg;
  }
  if (!helpMsgInterval) {
    helpMsgInterval = setInterval(() => {
      const el = stateManager.get("shadowRoot").querySelector(".modal-footer-hint .hint-text");
      if (el) el.textContent = getRandomStupidHelpMsg();
    }, 12000);
  }
}

export function stopHelpMessageCycle() {
  if (helpMsgInterval) {
    clearInterval(helpMsgInterval);
    helpMsgInterval = null;
    debugLog("HelpMsg", "Stopped help message interval.");
  }
}

export function syncHelpMessageFooter() {
  if (isHelpMessageDisabled()) {
    setHintTextVisibility(false);
    stopHelpMessageCycle();
    return;
  }
  startHelpMessageCycle();
}
