import { createStyledFeature } from "../../core/createStyledFeature.js";
import { addListener, removeListener } from "../../core/listenerRegistry.js";
import { debugLog } from "../../core/logger.js";
import { SELECTORS } from "../../config/selectors.js";
import featureCss from "./style.css";

const DELEGATED_LISTENER_ID = "signature-collapse-delegated-click";

function delegatedSignatureClickHandler(e) {
  const btn = e.target.closest(SELECTORS.SIGNATURE.TOGGLE_SELECTOR);
  if (!btn) return;

  const sig = btn.previousElementSibling;
  if (!sig || !sig.matches(SELECTORS.SIGNATURE.ASIDE_SELECTOR)) return;

  const expanded = sig.classList.toggle("latest-signature-expanded");
  btn.querySelector("span").textContent = expanded ? "Hide signature" : "Show signature";
}

function enableSignatureCollapse() {
  document.documentElement.classList.add("latest-signature-collapsed");
  addListener(DELEGATED_LISTENER_ID, document.body, "click", delegatedSignatureClickHandler);

  document.querySelectorAll(SELECTORS.SIGNATURE.ASIDE_SELECTOR).forEach((sig) => {
    debugLog("Signature Collapse", "Processing signature", { data: sig });
    if (sig.dataset.latestProcessed) return;
    sig.dataset.latestProcessed = "true";

    const btn = document.createElement("button");
    btn.innerHTML = "<span>Show signature</span>";
    btn.className = SELECTORS.SIGNATURE.TOGGLE_CLASS;
    btn.type = "button";

    sig.after(btn);
  });
}

function disableSignatureCollapse() {
  document.documentElement.classList.remove("latest-signature-collapsed");
  removeListener(DELEGATED_LISTENER_ID);

  document.querySelectorAll(SELECTORS.SIGNATURE.TOGGLE_SELECTOR).forEach((b) => b.remove());
  document.querySelectorAll(SELECTORS.SIGNATURE.ASIDE_SELECTOR).forEach((sig) => {
    delete sig.dataset.latestProcessed;
    sig.classList.remove("latest-signature-expanded");
  });
}

export const signatureCollapseFeature = createStyledFeature("Signature Collapse", {
  configPath: "threadSettings.collapseSignature",
  isApplicable: ({ stateManager }) => stateManager.get("isThread"),
  styleCss: featureCss,
  enable: enableSignatureCollapse,
  disable: disableSignatureCollapse,
});
