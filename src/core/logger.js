function normalizeDebugLogOptions(options) {
  if (typeof options === "string") {
    return { data: null, level: options };
  }

  if (!options || typeof options !== "object") {
    return { data: null, level: "log" };
  }

  if (Object.prototype.hasOwnProperty.call(options, "data")) {
    return {
      data: options.data,
      level: options.level || "log",
    };
  }

  const { level = "log", ...data } = options;
  return {
    data: Object.keys(data).length > 0 ? data : null,
    level,
  };
}

export function debugLog(feature, msg, options) {
  if (!__F95UE_DEBUG__) return;

  const { data, level } = normalizeDebugLogOptions(options);

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
