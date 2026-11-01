export const TIMINGS = Object.freeze({
  GOFILE_POST_READY_WAIT: 600,
  POLL_INTERVAL: 400,
  DATANODES_POLL_INTERVAL: 250,
  DATANODES_TOTAL_FLOW_TIMEOUT: 90000,
  DOWNLOAD_PAGE_CLOSE_DELAY: 3500,
  MIN_DOWNLOAD_PAGE_CLOSE_DELAY: 3000,
  BUZZHEAVIER_DOWNLOAD_BUTTON_WAIT_TIMEOUT: 20000,
  WORKUPLOAD_DOWNLOAD_BUTTON_WAIT_TIMEOUT: 15000,
  WORKUPLOAD_DOWNLOAD_START_SETTLE_DELAY: 1500,
});

export const SELECTORS = Object.freeze({
  BUZZHEAVIER: {
    DOWNLOAD_BUTTON_CANDIDATES: [
      'a.download-btn.gay-button[hx-get*="/download"]',
      'a.link-button.gay-button.htmx-request[hx-get*="/download"]',
      'a.download-btn[hx-get*="/download"]',
      'a[href*="/download"]',
    ],
  },
  GOFILE: {
    DOWNLOAD_BUTTON: 'button[data-action="download"]',
    ITEM_ROW: ".fm-row[data-id]",
  },
  MEDIAFIRE: {
    DOWNLOAD_BUTTON_CANDIDATES: [
      "#downloadButton.input.popsok",
      "a#downloadButton",
      '#download_link a[aria-label="Download file"]',
      "#download_link a.input.popsok",
      ".download_link .input",
      ".js-shared-status-edit",
    ],
  },
  WORKUPLOAD: {
    DOWNLOAD_BUTTON_CANDIDATES: [".download a[href]", "a.btn-prio[href]", 'a[href^="/start/"]'],
  },
});
