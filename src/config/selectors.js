// Centralized selector constants for the app
export const SELECTORS = {
  TILE: {
    ROOT: ".resource-tile",
    CLASS: "resource-tile",
    BODY: ".resource-tile_body",
    INFO_META: ".resource-tile_info-meta",
    VERSION: ".resource-tile_label-version",
    LABEL_WRAP: ".resource-tile_label-wrap_right",
    THUMB_WRAP: ".resource-tile_thumb-wrap",
    MODIFIED_SELECTOR: ".resource-tile[data-modified='true']",
  },
  TAG_PICKER: {
    INPUT: ".selectize-input.items.not-full",
    DROPDOWN: ".selectize-dropdown.single.filter-tags-select",
    OPTION: ".option",
    SELECTED_WRAP: ".filter-tags-selected-wrap.selectize-selected",
    SELECTED_TAG: "span[data-tag]",
  },
  GOFILE: {
    LOADING: "#filemanager_loading",
    ITEMS_LIST: "#filemanager_itemslist",
    ALERT: "#filemanager_alert",
  },
  BUZZHEAVIER: {
    DOWNLOAD_BUTTON_CANDIDATES: [
      'a[hx-get*="/download"]',
      'a[data-hx-get*="/download"]',
      'a[href*="/download"]',
    ],
  },
  PIXELDRAIN: {
    DOWNLOAD_BUTTON_CANDIDATES: [
      "div.description button.button_highlight",
      'div[class*="description"] button.button_highlight',
      'div[class*="block"] div[class*="description"] button.button_highlight',
      "button.button_highlight",
      "a.button.button_highlight",
      ".button_highlight",
    ],
  },
  DATANODES: {
    METHOD_FREE_BUTTON_ID: "method_free",
    METHOD_FREE_BUTTON: "#method_free",
    DOWNLOAD_BUTTON_PRIMARY: "button.bg-blue-600",
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
    CONTINUE_BTN: ".host_link",
    CONTINUE_BTN_CANDIDATES: [".host_link", "a.host_link", ".leaving a[href]", "#leaving a[href]"],
    LEAVING: ".leaving",
    LEAVING_CANDIDATES: [".leaving", "#leaving", ".leaving-page"],
    LEAVING_TEXT: ".leaving-text",
    LEAVING_TEXT_CANDIDATES: [".leaving-text", ".leaving .leaving-text", ".leaving p"],
    IDS: {
      LOADING: "loading",
      CAPTCHA: "captcha",
      ERROR: "error",
    },
  },
  IMAGE_REPAIR: {
    TOAST_ID: "img-retry-toast",
    WRAPPER_ID: "image-retry-toast-wrapper",
    TOAST_CLASS: ".img-retry-toast",
  },
  LATEST_CONTROL: {
    IDS: {
      AUTO_REFRESH: "controls_auto-refresh",
      NOTIFY: "controls_notify",
    },
  },
  NOTICE: {
    SELECTOR: ".js-notice",
    CLASS: "js-notice",
    DISMISS_SELECTOR: ".js-noticeDismiss",
    DISMISS_BTN_SELECTOR: ".js-notice-dismiss-btn",
  },
  WIDE_FORUM: {
    P_BODY_INNER: ".p-body-inner",
  },
  SIGNATURE: {
    TOGGLE_SELECTOR: ".latest-signature-toggle",
    ASIDE_SELECTOR: "aside.message-signature",
    TOGGLE_CLASS: "latest-signature-toggle",
  },
};

export default SELECTORS;
