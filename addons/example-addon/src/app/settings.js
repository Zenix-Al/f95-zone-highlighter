import { getStoredValue } from "../api/storage.js";
import { EXAMPLE_SETTINGS_KEY } from "../constants.js";

export const EXAMPLE_SETTINGS_DEFAULTS = Object.freeze({
  showDockLauncher: true,
  panelLogLimit: 20,
});

export const EXAMPLE_PANEL_SETTINGS = Object.freeze([
  Object.freeze({
    path: "showDockLauncher",
    text: "Show dock launcher",
    type: "toggle",
    tooltip: "Mount the Example Add-on launcher in the core-owned page dock.",
  }),
  Object.freeze({
    path: "panelLogLimit",
    text: "Panel log entries",
    type: "number",
    min: 1,
    max: 50,
    step: 1,
    tooltip: "Maximum number of recent API results retained in the playground panel.",
  }),
]);

export function normalizeExampleSettings(value) {
  const candidate = value && typeof value === "object" ? value : {};
  const panelLogLimit = Number(candidate.panelLogLimit);
  return {
    showDockLauncher: candidate.showDockLauncher !== false,
    panelLogLimit: Number.isFinite(panelLogLimit)
      ? Math.max(1, Math.min(50, Math.round(panelLogLimit)))
      : EXAMPLE_SETTINGS_DEFAULTS.panelLogLimit,
  };
}

export async function loadExampleSettings(core) {
  const result = await getStoredValue(core, EXAMPLE_SETTINGS_KEY, EXAMPLE_SETTINGS_DEFAULTS);
  return {
    result,
    settings: normalizeExampleSettings(result?.ok ? result.value : EXAMPLE_SETTINGS_DEFAULTS),
  };
}
