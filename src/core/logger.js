import { debug } from "../config";

export function debugLog(feature, msg, { data = null, level = "log" } = {}) {
  if (!debug) return;

  const logMethod = console[level] || console.log;

  // Use a different color for warnings/errors in the group header for better visibility.
  const style = level === "warn" ? "color: orange;" : level === "error" ? "color: red;" : "";

  // Group them so it's neat in console
  console.groupCollapsed(`%c[${feature}] ${msg}`, style);

  // Log the message again inside (optional but looks pro)
  logMethod(msg);

  // Now dump the object — it stays fully collapsible!
  if (data) {
    logMethod(data);
  }

  console.groupEnd();
}
