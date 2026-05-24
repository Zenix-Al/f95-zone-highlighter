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
  RATING_ENGAGEMENT: {
    RATING: ".resource-tile_info-meta_rating",
    LIKES: ".resource-tile_info-meta_likes",
    VIEWS: ".resource-tile_info-meta_views",
  },
  TAG_PICKER: {
    INPUT: ".selectize-input.items.not-full",
    DROPDOWN: ".selectize-dropdown.single.filter-tags-select",
    OPTION: ".option",
    SELECTED_WRAP: ".filter-tags-selected-wrap.selectize-selected",
    SELECTED_TAG: "span[data-tag]",
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
