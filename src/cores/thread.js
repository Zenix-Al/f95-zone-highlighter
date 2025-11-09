import { config, STATUS } from "../constants";

export function processThreadTags() {
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
  if (preferredId && config.threadSettings.preferred) {
    tagElement.classList.add(STATUS.PREFERRED);
  } else if (excludedId && config.threadSettings.excluded) {
    tagElement.classList.add(STATUS.EXCLUDED);
  } else if (config.threadSettings.neutral) {
    tagElement.classList.add(STATUS.NEUTRAL);
  }
}

export function autoRefreshClick() {
  const autoRefreshBtn = document.getElementById("controls_auto-refresh");
  if (!autoRefreshBtn) return;

  const selected = autoRefreshBtn.classList.contains("selected");

  if (
    (!selected && config.latestSettings.autoRefresh) ||
    (selected && !config.latestSettings.autoRefresh)
  ) {
    autoRefreshBtn.click();
  }
}

export function webNotifClick() {
  const webNotifBtn = document.getElementById("controls_notify");
  if (!webNotifBtn) return;

  const selected = webNotifBtn.classList.contains("selected");

  if (!selected && config.latestSettings.webNotif) {
    webNotifBtn.click();
  } else if (selected && !config.latestSettings.webNotif) {
    webNotifBtn.click();
  }
}
