import stateManager, { helpMessages } from "../../config.js";
import { debugLog } from "../../core/logger.js";

let helpMsgInterval = null;
const MOBILE_HELP_MSG_MAX_WIDTH = 480;

function isMobileViewport() {
  return window.matchMedia(`(max-width: ${MOBILE_HELP_MSG_MAX_WIDTH}px)`).matches;
}

function setHintVisibility(visible) {
  const shadowRoot = stateManager.get("shadowRoot");
  if (!shadowRoot) return;
  const hint = shadowRoot.querySelector(".modal-footer-hint");
  if (!hint) return;
  hint.style.display = visible ? "" : "none";
}

function getRandomStupidHelpMsg() {
  const randomIndex = Math.floor(Math.random() * helpMessages.length);
  return helpMessages[randomIndex];
}

export function startHelpMessageCycle() {
  if (isMobileViewport()) {
    setHintVisibility(false);
    if (helpMsgInterval) {
      clearInterval(helpMsgInterval);
      helpMsgInterval = null;
    }
    return;
  }

  setHintVisibility(true);
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
