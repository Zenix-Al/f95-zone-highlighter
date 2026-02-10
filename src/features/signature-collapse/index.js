import { config, state } from "../../config";
import { debugLog } from "../../core/logger";

export function signatureCollapse() {
  if (!state.isThread) return;

  const enabled = !!config.threadSettings.collapseSignature;
  const root = document.documentElement;

  root.classList.toggle("latest-signature-collapsed", enabled);

  if (!enabled) {
    cleanup();
    return;
  }

  document.querySelectorAll("aside.message-signature").forEach((sig) => {
    debugLog("Processing signature collapse", sig);
    if (sig.dataset.latestProcessed) return;
    sig.dataset.latestProcessed = "1";

    const btn = document.createElement("button");
    btn.innerHTML = "<span>Show signature</span>";
    btn.className = "latest-signature-toggle";
    btn.type = "button";

    btn.addEventListener("click", () => {
      const expanded = sig.classList.toggle("latest-signature-expanded");
      btn.querySelector("span").textContent = expanded ? "Hide signature" : "Show signature";
    });

    sig.after(btn);
  });
}

function cleanup() {
  document.querySelectorAll(".latest-signature-toggle").forEach((b) => b.remove());

  document.querySelectorAll("aside.message-signature").forEach((sig) => {
    delete sig.dataset.latestProcessed;
    sig.classList.remove("latest-signature-expanded");
  });
}
