import { saveConfigKeys } from "../../services/settingsService.js";

export const DIRECT_DOWNLOAD_ATTENTION_KEY = "directDownloadAttentionEvent";

export async function publishDirectDownloadAttention(
  host,
  message,
  code = "manual_required",
) {
  const safeHost = String(host || "unknown");
  const safeMessage = String(message || "Direct download needs manual action.");

  try {
    await saveConfigKeys({
      [DIRECT_DOWNLOAD_ATTENTION_KEY]: {
        ts: Date.now(),
        host: safeHost,
        code,
        message: safeMessage,
        href: location.href,
      },
    });
  } catch {
    // best-effort
  }
}

