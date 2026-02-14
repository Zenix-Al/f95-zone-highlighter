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
};

export default SELECTORS;
