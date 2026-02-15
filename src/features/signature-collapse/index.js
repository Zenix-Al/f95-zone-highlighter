import { createFeature } from "../../core/featureFactory.js";
import { addListener, removeListener } from "../../core/listenerRegistry.js";
import { debugLog } from "../../core/logger.js";
import { SELECTORS } from "../../config/selectors.js";
import featureCss from "./style.css";
import { acquireStyle, removeStyle } from "../../core/styleRegistry.js";

const DELEGATED_LISTENER_ID = "signature-collapse-delegated-click";
const SIGNATURE_COLLAPSE_STYLE_ID = "feature-signature-collapse";

function delegatedSignatureClickHandler(e) {
  const btn = e.target.closest(SELECTORS.SIGNATURE.TOGGLE_SELECTOR);
  if (!btn) return;

  const sig = btn.previousElementSibling;
  if (!sig || !sig.matches(SELECTORS.SIGNATURE.ASIDE_SELECTOR)) return;

  const expanded = sig.classList.toggle("latest-signature-expanded");
  btn.querySelector("span").textContent = expanded ? "Hide signature" : "Show signature";
}

function enableSignatureCollapse() {
  acquireStyle(SIGNATURE_COLLAPSE_STYLE_ID, featureCss, "document");
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
  removeStyle(SIGNATURE_COLLAPSE_STYLE_ID);

  document.querySelectorAll(SELECTORS.SIGNATURE.TOGGLE_SELECTOR).forEach((b) => b.remove());
  document.querySelectorAll(SELECTORS.SIGNATURE.ASIDE_SELECTOR).forEach((sig) => {
    delete sig.dataset.latestProcessed;
    sig.classList.remove("latest-signature-expanded");
  });
}

export const signatureCollapseFeature = createFeature("Signature Collapse", {
  configPath: "threadSettings.collapseSignature",
  enable: enableSignatureCollapse,
  disable: disableSignatureCollapse,
});
