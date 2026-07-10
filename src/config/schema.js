import {
  defaultAddonsSettings, defaultColors, defaultGlobalSettings, defaultLatestSettings,
  defaultMetrics, defaultOverlaySettings, defaultThreadSetting,
} from "./defaults.js";
import { isValidColor, isValidVersion } from "../utils/validators.js";

export const CONFIG_SCHEMA_VERSION = 1;
const EXPORTABLE = new Set(["tags", "preferredTags", "excludedTags", "markedTags", "color", "overlaySettings", "threadSettings", "globalSettings", "latestSettings"]);
const SYNCED = new Set(["color", "overlaySettings", "threadSettings", "latestSettings", "addons"]);
const DEFAULTS = Object.freeze({
  tags: [], prefixes: { items: [], categories: {} }, preferredTags: [], excludedTags: [], markedTags: [],
  color: defaultColors, overlaySettings: defaultOverlaySettings, threadSettings: defaultThreadSetting,
  globalSettings: defaultGlobalSettings, latestSettings: defaultLatestSettings, metrics: defaultMetrics,
  addons: defaultAddonsSettings, savedNotifID: null,
});
const METADATA = Object.freeze(Object.fromEntries(Object.keys(DEFAULTS).map((path) => [path, Object.freeze({
  persisted: true, exportable: EXPORTABLE.has(path), syncable: SYNCED.has(path), sensitive: false,
})])));

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function issue(path, code, expected, value) { return { path, code, expected, received: Array.isArray(value) ? "array" : value === null ? "null" : typeof value }; }
function isObject(value) { return value && typeof value === "object" && !Array.isArray(value); }
function sameShape(value, template, path, issues, strict) {
  if (Array.isArray(template)) {
    if (!Array.isArray(value)) { issues.push(issue(path, "type", "array", value)); return clone(template); }
    return clone(value);
  }
  if (isObject(template)) {
    if (!isObject(value)) { issues.push(issue(path, "type", "object", value)); return clone(template); }
    const out = {};
    if (strict) for (const key of Object.keys(value)) if (!(key in template)) issues.push(issue(`${path}.${key}`, "unknown", "known key", value[key]));
    for (const [key, fallback] of Object.entries(template)) out[key] = key in value ? sameShape(value[key], fallback, `${path}.${key}`, issues, strict) : clone(fallback);
    return out;
  }
  if (template === null) return value === null || typeof value === "string" || typeof value === "number" ? value : null;
  if (typeof value !== typeof template || (typeof template === "number" && !Number.isFinite(value))) { issues.push(issue(path, "type", typeof template, value)); return clone(template); }
  return value;
}

export function getDefaultConfig() { return clone(DEFAULTS); }
export function mergeWithDefaults(data) { return sanitizeConfig(data, { mode: "tolerant" }).data; }
export function getExportableConfigKeys() { return [...EXPORTABLE]; }
export function getSyncedConfigPaths() { return [...SYNCED]; }
export function getConfigPathMetadata(path) { return METADATA[path] || null; }
export function validateConfigSection(key, value, options = {}) { return validateConfig({ [key]: value }, { ...options, partial: true }); }
export function validateConfig(data, { mode = "strict", partial = false } = {}) {
  const strict = mode === "strict";
  const issues = [];
  if (!isObject(data)) return { valid: false, issues: [issue("", "type", "object", data)], data: getDefaultConfig() };
  if (strict) for (const key of Object.keys(data)) if (!(key in DEFAULTS)) issues.push(issue(key, "unknown", "known section", data[key]));
  const output = getDefaultConfig();
  for (const key of Object.keys(DEFAULTS)) if (key in data) output[key] = sameShape(data[key], DEFAULTS[key], key, issues, strict);
  if ("color" in data) for (const [key, value] of Object.entries(output.color)) if (!isValidColor(value)) issues.push(issue(`color.${key}`, "format", "hex color", value));
  if ("latestSettings" in data && !isValidVersion(output.latestSettings.minVersion)) issues.push(issue("latestSettings.minVersion", "range", "number >= 0", output.latestSettings.minVersion));
  for (const key of ["preferredTags", "excludedTags", "markedTags"]) if (key in data && new Set(output[key]).size !== output[key].length) issues.push(issue(key, "unique", "unique IDs", output[key]));
  return { valid: issues.length === 0, issues, data: partial ? Object.fromEntries(Object.keys(data).filter((key) => key in DEFAULTS).map((key) => [key, output[key]])) : output };
}
export function sanitizeConfig(data, options = {}) { return validateConfig(data, { ...options, mode: "tolerant" }); }
