import { createStyledFeature } from "../../core/createStyledFeature.js";
import { config, STATUS } from "../../config.js";
import { debugLog } from "../../core/logger.js";
import { isValidTag } from "../../utils/validators.js";
import featureCss from "./style.css";
import { resolveTagStatus } from "../../utils/resolveTagStatus.js";

function processThreadTag(tagElement) {
  const tagName = String(tagElement.innerHTML || "").trim();
  if (!isValidTag(tagName)) return; // skip malformed tag text

  const tag = config.tags.find((t) => t.name === tagName);
  const status = tag ? resolveTagStatus(Number(tag.id)) : null;

  Object.values(STATUS).forEach((cls) => tagElement.classList.remove(cls));

  const { preferred, preferredShadow, excluded, excludedShadow, marked } = config.threadSettings;

  if (status === STATUS.PREFERRED && preferred) {
    tagElement.classList.add(STATUS.PREFERRED);
    if (preferredShadow) tagElement.classList.add(STATUS.PREFERRED_SHADOW);
  } else if (status === STATUS.EXCLUDED && excluded) {
    tagElement.classList.add(STATUS.EXCLUDED);
    if (excludedShadow) tagElement.classList.add(STATUS.EXCLUDED_SHADOW);
  } else if (status === STATUS.MARKED && marked) {
    tagElement.classList.add(STATUS.MARKED);
  }
}

function enableThreadOverlay() {
  const tagList = document.querySelector(".js-tagList");
  if (!tagList) return;

  const tags = tagList.getElementsByClassName("tagItem");
  Array.from(tags).forEach(processThreadTag);
}

function disableThreadOverlay() {
  const tagList = document.querySelector(".js-tagList");
  if (!tagList) return;

  const tags = tagList.getElementsByClassName("tagItem");
  Array.from(tags).forEach((tag) => {
    Object.values(STATUS).forEach((cls) => {
      tag.classList.remove(cls);
    });
  });
  debugLog("Thread Overlay", "Disabled - tags returned to default style");
}

export const threadOverlayFeature = createStyledFeature("Thread Overlay", {
  configPath: "threadSettings.threadOverlayToggle",
  isApplicable: ({ stateManager }) => stateManager.get("isThread"),
  styleCss: featureCss,
  enable: enableThreadOverlay,
  disable: disableThreadOverlay,
});
