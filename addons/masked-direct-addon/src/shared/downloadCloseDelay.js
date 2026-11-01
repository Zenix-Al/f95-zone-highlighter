import { TIMINGS } from "../hosts/constants.js";

export const DEFAULT_DOWNLOAD_CLOSE_DELAY_MS = TIMINGS.DOWNLOAD_PAGE_CLOSE_DELAY;
export const MIN_DOWNLOAD_CLOSE_DELAY_MS = TIMINGS.MIN_DOWNLOAD_PAGE_CLOSE_DELAY;

export function normalizeDownloadCloseDelay(value, fallback = DEFAULT_DOWNLOAD_CLOSE_DELAY_MS) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(MIN_DOWNLOAD_CLOSE_DELAY_MS, Math.round(number))
    : fallback;
}
