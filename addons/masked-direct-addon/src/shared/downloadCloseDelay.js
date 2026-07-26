export const DEFAULT_DOWNLOAD_CLOSE_DELAY_MS = 3500;
export const MIN_DOWNLOAD_CLOSE_DELAY_MS = 3000;

export function normalizeDownloadCloseDelay(
  value,
  fallback = DEFAULT_DOWNLOAD_CLOSE_DELAY_MS,
) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(MIN_DOWNLOAD_CLOSE_DELAY_MS, Math.round(number))
    : fallback;
}
