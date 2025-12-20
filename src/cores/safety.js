import { config } from "../constants";

export function checkTags() {
  const el = document.getElementById("tag-error-notif");
  if (!el) return;

  if (config.tags.length === 0) {
    el.textContent = "No tag detected, go to f95zone latest page and open this menu again.";
    el.style.display = "block";
  } else {
    el.style.display = "none";
  }
}

export function colorErrorNotif(text) {
  const el = document.getElementById("color-error-notif");
  if (!el) return;
  el.textContent = text;
  if (text) {
    el.style.display = "block";
  } else {
    el.style.display = "none";
  }
}

export function tagsErrorNotif(text) {
  const el = document.getElementById("tag-error-notif");
  if (!el) return;
  el.textContent = text;
  if (text) {
    el.style.display = "block";
  } else {
    el.style.display = "none";
  }
}

export function checkOverlaySettings() {
  if (!config.latestSettings.latestOverlayToggle && !config.threadSettings.threadOverlayToggle) {
    colorErrorNotif("Both Latest and Thread overlay are disabled, nothing will be applied.");
    tagsErrorNotif("Both Latest and Thread overlay are disabled, nothing will be applied.");
  }
}
