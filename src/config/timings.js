// Centralized timing constants used across the app
export const TIMINGS = {
  TILE_POPULATE_CHECK_INTERVAL: 50, // ms between DOM checks
  TILE_POPULATE_TIMEOUT: 1500, // max wait for tile content
  TOAST_DISPLAY: 2000, // toast visibility
  DOWNLOAD_TIMEOUT: 8000, // download attempt timeout
  GOFILE_AUTO_CLOSE: 6000, // auto-close gofile tab delay
  IMAGE_RETRY_DELAY: 4000,
  POLL_INTERVAL: 400, // general poll interval for host pages
  GOFILE_POST_READY_WAIT: 600,
  RECAPTCHA_CLICK_INTERVAL: 500,
  LATEST_CONTROL_WEBNOTIF_DELAY: 400,
  IMAGE_REPAIR_QUEUE_DELAY: 200,
  LATEST_OVERLAY_QUEUE_DELAY: 1,
  LATEST_OVERLAY_FRAME_BUDGET_MS: 6,
  LATEST_OVERLAY_MIN_CHUNK: 30,
  IMAGE_RETRY_TOAST_INTERVAL: 500,
  SELECTOR_WAIT_TIMEOUT: 3000, // longer wait for complex host pages
  IMAGE_RETRY_MAX_ATTEMPTS: 10,
  AUTO_RETRY_TIMEOUT: 60000, // safety net for auto-retry flows
};

export default TIMINGS;
