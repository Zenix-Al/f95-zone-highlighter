import { createStyledFeature } from "../../core/createStyledFeature.js";
import { addListener, removeListener } from "../../core/listenerRegistry.js";
import { addObserverCallback, removeObserverCallback } from "../../core/observer.js";
import { debugLog } from "../../core/logger.js";
import { SELECTORS } from "../../config/selectors.js";
import featureCss from "./style.css";
import { createEnabledDisabledToast, createToggleSetting } from "../../ui/settings/metaFactory.js";

const DELEGATED_LISTENER_ID = "signature-collapse-delegated-click";
const OBSERVER_ID = "signature-collapse-content";

function processSignatures(root) {
  if (!root?.isConnected) return;
  const signatures = root.matches?.(SELECTORS.SIGNATURE.ASIDE_SELECTOR)
    ? [root] : root.querySelectorAll?.(SELECTORS.SIGNATURE.ASIDE_SELECTOR) || [];
  signatures.forEach((sig) => {
    if (sig.dataset.latestProcessed && sig.nextElementSibling?.matches(SELECTORS.SIGNATURE.TOGGLE_SELECTOR)) return;
    debugLog("Signature Collapse", "Processing signature", { data: sig });
    const btn = document.createElement("button");
    btn.innerHTML = "<span>Show signature</span>";
    btn.className = SELECTORS.SIGNATURE.TOGGLE_CLASS;
    btn.type = "button";
    sig.after(btn);
    sig.dataset.latestProcessed = "true";
  });
}

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

  addObserverCallback(OBSERVER_ID, (mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes || []) {
        if (node.nodeType === 1 && !node.matches(SELECTORS.SIGNATURE.TOGGLE_SELECTOR)) processSignatures(node);
      }
    }
  }, { filter: (mutations) => mutations.some((mutation) => mutation.addedNodes?.length) });
  processSignatures(document.documentElement);
}

function disableSignatureCollapse() {
  removeObserverCallback(OBSERVER_ID);
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
  pageScopes: ["isThread"],
  isApplicable: ({ stateManager }) => stateManager.get("isThread"),
  styleCss: featureCss,
  enable: enableSignatureCollapse,
  disable: disableSignatureCollapse,
  settingsUi: {
    id: "signature-collapse",
    sectionId: "thread",
    metaMaps: [
      {
        signatureCollapseToggle: createToggleSetting({
          text: "Collapsable Signatures",
          tooltip: "Make user signatures collapsable in threads",
          config: "threadSettings.collapseSignature",
          custom: () => signatureCollapseFeature.toggle(signatureCollapseFeature.isEnabled()),
          toast: createEnabledDisabledToast("Signature collapse"),
        }),
      },
    ],
  },
});
