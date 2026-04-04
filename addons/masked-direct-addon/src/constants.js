export const ADDON_COMMAND_EVENT = "f95ue:addon-command";
export const RESOLVE_BTN_CLASS = "f95ue-addon-resolve-btn";
export const MASKED_LINK_SELECTOR = 'a[href^="/masked/"], a[href^="https://f95zone.to/masked/"]';
export const F95_CAPTCHA_SITEKEY = "6LcwQ5kUAAAAAAI-_CXQtlnhdMjmFDt-MruZ2gov";
export const DIRECT_HOSTS = ["buzzheavier.com", "gofile.io", "pixeldrain.com", "datanodes.to"];
export const AUTOMATION_MARKER_KEY = "f95ue_dd";
export const DATANODES_STAGE_KEY = "f95ue.datanodes.stage";
export const DATANODES_STAGE_AFTER_FREE = "after_free";

export const TIMINGS = Object.freeze({
  GOFILE_POST_READY_WAIT: 600,
  POLL_INTERVAL: 400,
  RECAPTCHA_CLICK_INTERVAL: 500,
  DATANODES_POLL_INTERVAL: 250,
  DATANODES_BUTTON_WAIT_TIMEOUT: 6000,
  DATANODES_SECOND_CLICK_DELAY: 6500,
});

export const SELECTORS = Object.freeze({
  BUZZHEAVIER: {
    DOWNLOAD_BUTTON_CANDIDATES: [
      'a.link-button.gay-button.htmx-request[hx-get*="/download"]',
      'a[hx-get*="/download"]',
      'a[href*="/download"]',
    ],
  },
  GOFILE: {
    LOADING: "#filemanager_loading",
    ITEMS_LIST: "#filemanager_itemslist",
    ALERT: "#filemanager_alert",
  },
  DATANODES: {
    METHOD_FREE_BUTTON_ID: "method_free",
    METHOD_FREE_BUTTON_CANDIDATES: [
      "#method_free",
      'button[name="method_free"]',
      'button[id*="method_free"]',
    ],
    DOWNLOAD_BUTTON_PRIMARY_CANDIDATES: [
      "button.bg-blue-600",
      'button[id*="download"]',
      'button[name*="download"]',
      'button[data-action*="download"]',
    ],
  },
  MASKED_PAGE: {
    CONTINUE_BTN_CANDIDATES: [".host_link", "a.host_link", ".leaving a[href]", "#leaving a[href]"],
    LEAVING_CANDIDATES: [".leaving", "#leaving", ".leaving-page"],
    LEAVING_TEXT_CANDIDATES: [".leaving-text", ".leaving .leaving-text", ".leaving p"],
    IDS: {
      LOADING: "loading",
      CAPTCHA: "captcha",
      ERROR: "error",
    },
  },
});
