import { debouncedProcessAllTilesReset } from "../../core/tasksRegistry";
import { createEnabledDisabledToast, createToggleSetting } from "./metaFactory";

// meta/overlaySettings.js
export const overlaySettingsMeta = {
  _header_visibility: {
    type: "header",
    text: "Overlay Visibility Settings",
  },
  completed: createToggleSetting({
    text: "Completed",
    tooltip: "Show overlay for completed threads",
    config: "overlaySettings.completed",
    custom: debouncedProcessAllTilesReset,
    toast: createEnabledDisabledToast("Completed"),
  }),
  onhold: createToggleSetting({
    text: "On Hold",
    tooltip: "Show overlay for threads on hold",
    config: "overlaySettings.onhold",
    custom: debouncedProcessAllTilesReset,
    toast: createEnabledDisabledToast("On Hold"),
  }),
  abandoned: createToggleSetting({
    text: "Abandoned",
    tooltip: "Show overlay for abandoned threads",
    config: "overlaySettings.abandoned",
    custom: debouncedProcessAllTilesReset,
    toast: createEnabledDisabledToast("Abandoned"),
  }),
  highVersion: createToggleSetting({
    text: "High Version tag",
    tooltip: "Show overlay for game threads with higher version than your set minimum",
    config: "overlaySettings.highVersion",
    custom: debouncedProcessAllTilesReset,
    toast: createEnabledDisabledToast("High Version"),
  }),
  invalidVersion: createToggleSetting({
    text: "Invalid Version tag",
    tooltip: "Show overlay for threads with invalid version format",
    config: "overlaySettings.invalidVersion",
    custom: debouncedProcessAllTilesReset,
    toast: createEnabledDisabledToast("Invalid Version"),
  }),
  preferred: createToggleSetting({
    text: "Preferred",
    tooltip: "Show overlay for threads you've marked as preferred",
    config: "overlaySettings.preferred",
    custom: debouncedProcessAllTilesReset,
    toast: createEnabledDisabledToast("Preferred"),
  }),
  excluded: createToggleSetting({
    text: "Excluded",
    tooltip: "Show overlay for threads you've marked as excluded",
    config: "overlaySettings.excluded",
    custom: debouncedProcessAllTilesReset,
    toast: createEnabledDisabledToast("Excluded"),
  }),
  overlayText: createToggleSetting({
    text: "Text overlay on tiles",
    tooltip: "Display status text directly over the thread thumbnail",
    config: "overlaySettings.overlayText",
    custom: debouncedProcessAllTilesReset,
    toast: createEnabledDisabledToast("Overlay Text"),
  }),
};
