const LATEST_DATA_PATTERN = /(?:^|\/|\b)latest_data\.php(?:\?|$)/;

export function isLatestDataRequest(settings) {
  return LATEST_DATA_PATTERN.test(String(settings?.url || ""));
}

export function normalizeLatestAjaxErrorPayload(
  jqXHR,
  fallbackMessage = "Unable to fetch data, please try again",
) {
  if (!jqXHR || typeof jqXHR !== "object") return false;
  if (jqXHR.responseJSON && typeof jqXHR.responseJSON === "object") return false;
  try {
    jqXHR.responseJSON = { msg: String(fallbackMessage || "Unable to fetch data, please try again") };
    return true;
  } catch {
    return false;
  }
}

export function shouldRetryLatestAjaxError(textStatus, jqXHR = {}) {
  const status = Number(jqXHR?.status || 0);
  if (status === 403 || status === 429) return false;
  return textStatus === "parsererror" || textStatus === "timeout" || status === 0 || status >= 500;
}
