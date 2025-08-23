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
