export const EXAMPLE_DOCK_MOUNT_ID = "example-addon-dock-widget";
export const EXAMPLE_PANEL_DIALOG_ID = "example-addon-panel-dialog";
export const EXAMPLE_BULK_PROGRESS_DIALOG_ID = "example-addon-bulk-progress";
export const EXAMPLE_EXTRA_MOUNT_ID = "example-addon-extra";
export const EXAMPLE_STYLE_ID = "example-addon-style";
export const EXAMPLE_DIALOG_ID = "example-addon-dialog";
export const EXAMPLE_OBSERVER_ID = "example-addon-observer";
export const EXAMPLE_STORAGE_KEY = "playground";
export const EXAMPLE_SETTINGS_KEY = "settings";
export const EXAMPLE_IDB_DB_NAME = "example-playground";
export const EXAMPLE_IDB_STORE_NAME = "records";
export const EXAMPLE_IDB_PRIMARY_KEY = "hello-world";
export const EXAMPLE_DUMMY_BULK_TOTAL = 36;

export const EXAMPLE_DOCK_BUTTONS = Object.freeze([
  {
    id: "show-toast",
    label: "Example Toast",
    variant: "primary",
    title: "Show a toast through the core API",
  },
  {
    id: "open-panel",
    label: "Open Panel",
    variant: "secondary",
    title: "Open the main example panel",
  },
  {
    id: "refresh-panel",
    label: "Refresh Panel",
    variant: "secondary",
    title: "Trigger feature.refresh on the example add-on",
  },
]);
