import stateManager, { helpMessages } from "../../config.js";
import { debugLog } from "../../core/logger.js";

let helpMsgInterval = null;

function getRandomStupidHelpMsg() {
  const randomIndex = Math.floor(Math.random() * helpMessages.length);
  return helpMessages[randomIndex];
}

export function startHelpMessageCycle() {
  const msg = getRandomStupidHelpMsg();
  debugLog("getRandomStupidHelpMsg", `Selected help message: ${msg}`);
  const hintSpan = stateManager.get('shadowRoot').querySelector(".modal-footer-hint .hint-text");
  if (hintSpan) {
    hintSpan.textContent = msg;
  }
  if (!helpMsgInterval) {
    helpMsgInterval = setInterval(() => {
      const el = stateManager.get('shadowRoot').querySelector(".modal-footer-hint .hint-text");
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
