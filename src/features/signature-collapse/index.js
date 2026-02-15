import { createFeature } from "../../core/featureFactory.js";
import { addListener, removeListener } from "../../core/listenerRegistry.js";
import { debugLog } from "../../core/logger.js";

const DELEGATED_LISTENER_ID = "signature-collapse-delegated-click";

function delegatedSignatureClickHandler(e) {
  const btn = e.target.closest(".latest-signature-toggle");
  if (!btn) return;

  const sig = btn.previousElementSibling;
  if (!sig || !sig.matches("aside.message-signature")) return;

  const expanded = sig.classList.toggle("latest-signature-expanded");
  btn.querySelector("span").textContent = expanded ? "Hide signature" : "Show signature";
}

function enableSignatureCollapse() {
  document.documentElement.classList.add("latest-signature-collapsed");
  addListener(DELEGATED_LISTENER_ID, document.body, "click", delegatedSignatureClickHandler);

  document.querySelectorAll("aside.message-signature").forEach((sig) => {
    debugLog("Signature Collapse", "Processing signature", { data: sig });
    if (sig.dataset.latestProcessed) return;
    sig.dataset.latestProcessed = "true";

    const btn = document.createElement("button");
    btn.innerHTML = "<span>Show signature</span>";
    btn.className = "latest-signature-toggle";
    btn.type = "button";

    sig.after(btn);
  });
}

function disableSignatureCollapse() {
  document.documentElement.classList.remove("latest-signature-collapsed");
  removeListener(DELEGATED_LISTENER_ID);

  document.querySelectorAll(".latest-signature-toggle").forEach((b) => b.remove());
  document.querySelectorAll("aside.message-signature").forEach((sig) => {
    delete sig.dataset.latestProcessed;
    sig.classList.remove("latest-signature-expanded");
  });
}

export const signatureCollapseFeature = createFeature("Signature Collapse", {
  configPath: "threadSettings.collapseSignature",
  enable: enableSignatureCollapse,
  disable: disableSignatureCollapse,
});
