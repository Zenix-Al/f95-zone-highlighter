import { debug } from "../constants";

export function debugLog(feature, msg, obj = {}) {
  if (!debug) return;

  // Group them so it's neat in console
  console.groupCollapsed(`[${feature}] ${msg}`);

  // Log the message again inside (optional but looks pro)
  console.log(msg);

  // Now dump the object — it stays fully collapsible!
  if (Object.keys(obj).length > 0) {
    console.log(obj); // ← this one keeps the object interactive
    // or console.dir(obj) if you want the property list style
  }

  console.groupEnd();
}
