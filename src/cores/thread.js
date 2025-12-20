import { config, debug, state, STATUS } from "../constants";

export function processThreadTags() {
  if (!state.isThread || !config.threadSettings.threadOverlayToggle) return;
  const tagList = document.querySelector(".js-tagList");
  if (!tagList) {
    return;
  }
  let tags = tagList.getElementsByClassName("tagItem");
  tags = Array.from(tags);
  tags.forEach((tag) => {
    processThreadTag(tag);
  });
}
export function processThreadTag(tagElement) {
  const tagName = tagElement.innerHTML.trim();

  // Check if tag ID exists in preferred/excluded
  const preferredId = config.preferredTags.find((id) =>
    config.tags.find((t) => t.id === id && t.name === tagName)
  );
  const excludedId = config.excludedTags.find((id) =>
    config.tags.find((t) => t.id === id && t.name === tagName)
  );

  // Remove all possible STATUS classes first
  Object.values(STATUS).forEach((cls) => tagElement.classList.remove(cls));

  // Apply class only if setting is enabled
  const { preferred, preferredShadow, excluded, excludedShadow, neutral } = config.threadSettings;

  if (preferredId && preferred) {
    tagElement.classList.add(STATUS.PREFERRED);
    preferredShadow && tagElement.classList.add(STATUS.PREFFERED_SHADOW);
    return;
  } else if (excludedId && excluded) {
    tagElement.classList.add(STATUS.EXCLUDED);
    excludedShadow && tagElement.classList.add(STATUS.EXCLUDED_SHADOW);
    return;
  } else if (neutral) {
    tagElement.classList.add(STATUS.NEUTRAL);
  }
}
export function toggleThreadTagOverlay() {
  if (!state.isThread) return;
  if (config.threadSettings.threadOverlayToggle) {
    processThreadTags();
  } else {
    disableThreadTagOverlay();
  }
}
export function disableThreadTagOverlay() {
  if (!state.isThread) return;
  // Find all tags that might have been processed
  const tagList = document.querySelector(".js-tagList");
  if (!tagList) return;

  const tags = tagList.getElementsByClassName("tagItem");
  Array.from(tags).forEach((tag) => {
    // Remove every possible status class we ever added
    Object.values(STATUS).forEach((cls) => {
      tag.classList.remove(cls);
    });
  });

  console.log("Thread tag overlay disabled — tags back to vanilla");
}
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
    debug && console.log("Processing signature collapse", sig);
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
