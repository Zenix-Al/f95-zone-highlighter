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
  },
  GOFILE: {
    LOADING: "#filemanager_loading",
    ITEMS_LIST: "#filemanager_itemslist",
    ALERT: "#filemanager_alert",
  },
  MASKED_PAGE: {
    CONTINUE_BTN: ".host_link",
    LEAVING: ".leaving",
    LEAVING_TEXT: ".leaving-text",
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
