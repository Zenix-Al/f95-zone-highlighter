import {
  defaultAddonsApiThrottleSettings,
  defaultAddonsSettings,
  defaultColors,
  defaultGlobalSettings,
  defaultLatestSettings,
  defaultOverlaySettings,
  defaultPrefixes,
  defaultPriorityWeights,
  defaultSavedNotifID,
  defaultTagModifiers,
  defaultTags,
  defaultThreadSetting,
} from "./defaults.js";
import {
  isValidColor,
  isValidLatestOverlayStyle,
  isValidTag,
  isValidVersion,
} from "../utils/validators.js";
import { isValidOverlayColorOrder } from "../features/latest-overlay/overlayOrder.js";

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function node(type, defaultValue, options = {}) {
  return { type, defaultValue, ...options };
}

function bool(defaultValue) { return node("boolean", defaultValue); }
function finiteNumber(defaultValue, { min = null, max = null, integer = false, required = false } = {}) {
  return node("number", defaultValue, { min, max, integer, required });
}
function string(defaultValue, options = {}) { return node("string", defaultValue, options); }

const anyValue = node("any", {});
const tag = node("object", {}, {
  properties: {
    id: finiteNumber(0, { min: 1, integer: true, required: true }),
    name: string("", { minLength: 1, maxLength: 200, required: true, validate: (value) => isValidTag(value) ? null : { code: "format", expected: "non-empty tag name" } }),
  },
  additionalProperties: false,
});
const prefix = node("object", {}, {
  properties: {
    id: finiteNumber(0, { min: 0, required: true }),
    name: string("", { minLength: 1, maxLength: 200, required: true }),
    class: string("", { maxLength: 200 }),
  },
  additionalProperties: false,
});
const prefixGroup = node("object", {}, {
  properties: {
    id: node("number", null, { nullable: true, min: 0 }),
    name: string("", { maxLength: 200 }),
    prefixes: node("array", [], { items: prefix }),
    prefixIds: node("array", [], { items: finiteNumber(0, { min: 0 }), unique: true }),
  },
  additionalProperties: false,
});
const prefixCatalog = node("object", defaultPrefixes, {
  properties: {
    items: node("array", [], { items: prefix }),
    categories: node("object", {}, { keyPattern: /^[a-z0-9_-]{1,100}$/i, additionalProperties: node("array", [], { items: prefixGroup }) }),
  },
  additionalProperties: false,
});

const color = node("object", defaultColors, {
  properties: Object.fromEntries(Object.keys(defaultColors).map((key) => [
    key,
    string(defaultColors[key], { pattern: /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i, validate: (value) => isValidColor(value) ? null : { code: "format", expected: "hex color" } }),
  ])),
  additionalProperties: false,
});
const overlaySettings = node("object", defaultOverlaySettings, {
  properties: Object.fromEntries(Object.keys(defaultOverlaySettings).map((key) => [key, bool(defaultOverlaySettings[key])])),
  additionalProperties: false,
});
const threadSettings = node("object", defaultThreadSetting, {
  properties: Object.fromEntries(Object.keys(defaultThreadSetting).map((key) => [key, bool(defaultThreadSetting[key])])),
  additionalProperties: false,
});
const globalSettings = node("object", defaultGlobalSettings, {
  properties: Object.fromEntries(Object.keys(defaultGlobalSettings).map((key) => [key, bool(defaultGlobalSettings[key])])),
  additionalProperties: false,
});
const priorityWeights = node("object", defaultPriorityWeights, {
  properties: Object.fromEntries(Object.keys(defaultPriorityWeights).map((key) => [key, finiteNumber(defaultPriorityWeights[key], { min: 0, max: 100 })])),
  additionalProperties: false,
});
const tagModifiers = node("object", defaultTagModifiers, {
  properties: Object.fromEntries(Object.keys(defaultTagModifiers).map((key) => [key, finiteNumber(defaultTagModifiers[key], { min: -10, max: 10 })])),
  additionalProperties: false,
});
const latestSettings = node("object", defaultLatestSettings, {
  properties: {
    autoRefresh: bool(defaultLatestSettings.autoRefresh),
    webNotif: bool(defaultLatestSettings.webNotif),
    minVersion: finiteNumber(defaultLatestSettings.minVersion, { min: 0, max: 1000, validate: (value) => isValidVersion(value) ? null : { code: "range", expected: "version >= 0" } }),
    wideLatest: bool(defaultLatestSettings.wideLatest),
    denseLatestGrid: bool(defaultLatestSettings.denseLatestGrid),
    latestOverlayToggle: bool(defaultLatestSettings.latestOverlayToggle),
    latestOverlayColorOrder: node("array", defaultLatestSettings.latestOverlayColorOrder, {
      items: string("", { enum: ["excluded", "preferred", "completed", "onhold", "abandoned", "highVersion", "invalidVersion"] }),
      unique: true,
      exactLength: 7,
      validate: (value) => isValidOverlayColorOrder(value) ? null : { code: "order", expected: "each overlay key exactly once" },
    }),
    latestOverlayStyle: string(defaultLatestSettings.latestOverlayStyle, {
      enum: ["strip", "border"],
      validate: (value) => isValidLatestOverlayStyle(value) ? null : { code: "enum", expected: "strip or border" },
    }),
    ratingHighlightThreshold: finiteNumber(defaultLatestSettings.ratingHighlightThreshold, { min: 0, max: 100000 }),
    engagementRatioThreshold: finiteNumber(defaultLatestSettings.engagementRatioThreshold, { min: 0, max: 100000 }),
    enableScoreWeights: bool(defaultLatestSettings.enableScoreWeights),
    priorityWeights,
    tagModifiers,
  },
  additionalProperties: false,
});

const addonId = string("", { minLength: 1, maxLength: 128, pattern: /^[a-z0-9][a-z0-9_-]*$/i });
const addonState = node("object", {}, { additionalProperties: anyValue });
const addons = node("object", defaultAddonsSettings, {
  properties: {
    trustedIds: node("array", defaultAddonsSettings.trustedIds, { items: addonId, unique: true }),
    byAddon: node("object", {}, { keyPattern: /^[a-z0-9][a-z0-9_-]{0,127}$/i,
      additionalProperties: node("object", {}, {
        properties: { state: addonState },
        additionalProperties: false,
      }),
    }),
    installedMeta: node("object", {}, { keyPattern: /^[a-z0-9][a-z0-9_-]{0,127}$/i,
      additionalProperties: node("object", {}, {
        properties: {
          name: string("", { maxLength: 200 }),
          version: string("", { maxLength: 100 }),
          description: string("", { maxLength: 10000 }),
          panelTitle: string("", { maxLength: 200 }),
          panelBody: string("", { maxLength: 10000 }),
          statusMessage: string("", { maxLength: 500 }),
          pageScopes: node("array", [], { items: string("", { maxLength: 200 }) }),
          runtimeMode: string("", { maxLength: 50 }),
          matches: node("array", [], { items: string("", { maxLength: 1000 }) }),
          capabilities: node("array", [], { items: string("", { maxLength: 200 }), unique: true }),
          installedSeenAt: finiteNumber(0, { min: 0 }),
          lastSeenAt: finiteNumber(0, { min: 0 }),
        },
        additionalProperties: false,
      }),
    }),
    service: node("object", defaultAddonsSettings.service, {
      properties: {
        apiThrottle: node("object", defaultAddonsApiThrottleSettings, {
          properties: {
            coreActionWindowMs: finiteNumber(defaultAddonsApiThrottleSettings.coreActionWindowMs, { min: 250, max: 60000, integer: true }),
            coreActionRateMax: finiteNumber(defaultAddonsApiThrottleSettings.coreActionRateMax, { min: 1, max: 1000, integer: true }),
            coreActionMaxConcurrent: finiteNumber(defaultAddonsApiThrottleSettings.coreActionMaxConcurrent, { min: 1, max: 100, integer: true }),
          },
          additionalProperties: false,
        }),
      },
      additionalProperties: false,
    }),
  },
  additionalProperties: false,
});
const CONFIG_SCHEMA = {
  tags: node("array", defaultTags, { items: tag, uniqueBy: "id", exportable: true }),
  prefixes: prefixCatalog,
  preferredTags: node("array", [], { items: finiteNumber(0, { min: 1, integer: true }), unique: true, exportable: true }),
  excludedTags: node("array", [], { items: finiteNumber(0, { min: 1, integer: true }), unique: true, exportable: true }),
  markedTags: node("array", [], { items: finiteNumber(0, { min: 1, integer: true }), unique: true, exportable: true }),
  color: { ...color, exportable: true },
  overlaySettings: { ...overlaySettings, exportable: true },
  threadSettings: { ...threadSettings, exportable: true },
  globalSettings: { ...globalSettings, exportable: true },
  latestSettings: { ...latestSettings, exportable: true },
  addons,
  savedNotifID: node("number", defaultSavedNotifID, { nullable: true, min: 1, integer: true }),
};

const METADATA_INDEX = new Map();

function buildIndexes() {
  const walk = (descriptor, path, inherited = {}) => {
    const metadata = Object.freeze({
      persisted: true,
      exportable: Boolean(inherited.exportable || descriptor.exportable),
      sensitive: Boolean(inherited.sensitive || descriptor.sensitive),
      reloadRequired: Boolean(inherited.reloadRequired || descriptor.reloadRequired),
    });
    METADATA_INDEX.set(path, metadata);
    if (descriptor.properties) {
      for (const [key, child] of Object.entries(descriptor.properties)) walk(child, `${path}.${key}`, metadata);
    }
    if (descriptor.additionalProperties && descriptor.additionalProperties !== false && typeof descriptor.additionalProperties === "object") {
      walk(descriptor.additionalProperties, `${path}.*`, metadata);
    }
    if (descriptor.items) walk(descriptor.items, `${path}[]`, metadata);
  };
  for (const [key, descriptor] of Object.entries(CONFIG_SCHEMA)) walk(descriptor, key);
}

deepFreeze(CONFIG_SCHEMA);
buildIndexes();
const ROOT_DEFAULT_CONFIG = Object.freeze(Object.fromEntries(
  Object.entries(CONFIG_SCHEMA).map(([key, descriptor]) => [key, descriptor.defaultValue]),
));
export { CONFIG_SCHEMA };

function typeOf(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function issue(path, code, expected, value) {
  const receivedType = typeOf(value);
  return {
    path,
    code,
    expected,
    received: receivedType,
    receivedType,
    receivedSummary: receivedType,
  };
}

function isObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }

function validateNode(value, descriptor, path, context) {
  if (value === undefined) {
    if (descriptor.required) context.issues.push(issue(path, "required", descriptor.type, value));
    return clone(descriptor.defaultValue);
  }
  if (value === null && descriptor.nullable) return null;
  if (descriptor.type === "any") return clone(value);

  if (descriptor.type === "array" && !Array.isArray(value)) {
    context.issues.push(issue(path, "type", "array", value));
    return clone(descriptor.defaultValue);
  }
  if (descriptor.type === "object" && !isObject(value)) {
    context.issues.push(issue(path, "type", "object", value));
    return clone(descriptor.defaultValue);
  }
  if (descriptor.type !== "array" && descriptor.type !== "object" && typeof value !== descriptor.type) {
    context.issues.push(issue(path, "type", descriptor.type, value));
    return clone(descriptor.defaultValue);
  }

  const validationStart = context.issues.length;
  if (descriptor.type === "string") {
    if (descriptor.minLength !== undefined && value.length < descriptor.minLength) context.issues.push(issue(path, "length", `string length >= ${descriptor.minLength}`, value));
    if (descriptor.maxLength !== undefined && value.length > descriptor.maxLength) context.issues.push(issue(path, "length", `string length <= ${descriptor.maxLength}`, value));
    if (descriptor.pattern && !descriptor.pattern.test(value)) context.issues.push(issue(path, "pattern", "matching string pattern", value));
    if (descriptor.enum && !descriptor.enum.includes(value)) context.issues.push(issue(path, "enum", descriptor.enum.join(" | "), value));
  }
  if (descriptor.type === "number") {
    if (!Number.isFinite(value)) context.issues.push(issue(path, "finite", "finite number", value));
    if (descriptor.integer && !Number.isInteger(value)) context.issues.push(issue(path, "integer", "integer", value));
    if (descriptor.min !== null && descriptor.min !== undefined && value < descriptor.min) context.issues.push(issue(path, "range", `number >= ${descriptor.min}`, value));
    if (descriptor.max !== null && descriptor.max !== undefined && value > descriptor.max) context.issues.push(issue(path, "range", `number <= ${descriptor.max}`, value));
  }

  if (descriptor.type === "array") {
    const result = [];
    for (let index = 0; index < value.length; index++) {
      const itemStart = context.issues.length;
      const normalizedItem = validateNode(value[index], descriptor.items || anyValue, `${path}[${index}]`, context);
      if (context.mode !== "strict" && context.issues.length > itemStart) continue;
      result.push(normalizedItem);
    }
    if (descriptor.unique || descriptor.uniqueBy) {
      const seen = new Set();
      const deduped = [];
      for (let index = 0; index < result.length; index++) {
        const key = descriptor.uniqueBy ? result[index]?.[descriptor.uniqueBy] : result[index];
        if (seen.has(key)) {
          context.issues.push(issue(`${path}[${index}]`, "unique", "unique array item", result[index]));
          if (context.mode !== "strict") continue;
        }
        seen.add(key);
        deduped.push(result[index]);
      }
      if (context.mode !== "strict") result.splice(0, result.length, ...deduped);
    }
    if (descriptor.exactLength !== undefined && result.length !== descriptor.exactLength) context.issues.push(issue(path, "length", `array length ${descriptor.exactLength}`, result));
    if (descriptor.validate) {
      const resultIssue = descriptor.validate(result);
      if (resultIssue) context.issues.push(issue(path, resultIssue.code, resultIssue.expected, result));
    }
    if (context.mode !== "strict" && context.issues.length > validationStart && descriptor.exactLength !== undefined && result.length !== descriptor.exactLength) {
      return clone(descriptor.defaultValue);
    }
    return result;
  }

    if (descriptor.type === "object") {
    const result = {};
    const properties = descriptor.properties || {};
    for (const key of Object.keys(value)) {
      if (descriptor.keyPattern && !descriptor.keyPattern.test(key)) context.issues.push(issue(`${path}.${key}`, "key", "matching object key pattern", key));
      if (Object.hasOwn(properties, key)) continue;
      if (descriptor.additionalProperties && descriptor.additionalProperties !== false) continue;
      context.issues.push(issue(`${path ? `${path}.` : ""}${key}`, "unknown", "known key", value[key]));
    }
    for (const [key, child] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) result[key] = validateNode(value[key], child, `${path}.${key}`, context);
      else result[key] = clone(child.defaultValue);
    }
    if (descriptor.additionalProperties && descriptor.additionalProperties !== false && typeof descriptor.additionalProperties === "object") {
      for (const key of Object.keys(value)) {
        if (Object.hasOwn(properties, key)) continue;
        if (descriptor.keyPattern && !descriptor.keyPattern.test(key)) {
          if (context.mode !== "strict") continue;
        }
        result[key] = descriptor.additionalProperties === true
          ? clone(value[key])
          : validateNode(value[key], descriptor.additionalProperties, `${path}.${key}`, context);
      }
    }
    if (descriptor.validate) {
      const resultIssue = descriptor.validate(result);
      if (resultIssue) context.issues.push(issue(path, resultIssue.code, resultIssue.expected, result));
    }
    return result;
  }

  if (descriptor.validate) {
    const resultIssue = descriptor.validate(value);
    if (resultIssue) context.issues.push(issue(path, resultIssue.code, resultIssue.expected, value));
  }
  return context.mode !== "strict" && context.issues.length > validationStart
    ? clone(descriptor.defaultValue)
    : value;
}

export function getDefaultConfig() {
  return clone(ROOT_DEFAULT_CONFIG);
}

export function mergeWithDefaults(data) {
  return sanitizeConfig(data, { mode: "tolerant" }).data;
}

export function getExportableConfigKeys() {
  return Object.keys(CONFIG_SCHEMA).filter((path) => METADATA_INDEX.get(path)?.exportable);
}

export function getPersistedConfigPaths() {
  return Object.keys(CONFIG_SCHEMA).filter((path) => METADATA_INDEX.get(path)?.persisted);
}

export function getConfigPathMetadata(path) {
  const normalized = String(path || "").trim().replace(/\[\d+\]/g, "[]");
  if (METADATA_INDEX.has(normalized)) return METADATA_INDEX.get(normalized);
  const segments = normalized.split(".");
  let bestMetadata = null;
  let bestSpecificity = -1;
  for (const [pattern, metadata] of METADATA_INDEX.entries()) {
    const patternSegments = pattern.split(".");
    if (patternSegments.length !== segments.length) continue;
    let specificity = 0;
    let matches = true;
    for (let index = 0; index < segments.length; index++) {
      const patternSegment = patternSegments[index];
      const segment = segments[index];
      if (patternSegment === "*" || (patternSegment === "*[]" && segment.endsWith("[]"))) continue;
      if (patternSegment !== segment) {
        matches = false;
        break;
      }
      specificity += 1;
    }
    if (matches && specificity > bestSpecificity) {
      bestMetadata = metadata;
      bestSpecificity = specificity;
    }
  }
  return bestMetadata;
}

export function getSchemaPathIndex() {
  return Object.freeze(Object.fromEntries([...METADATA_INDEX.entries()]));
}

export function validateConfigSection(key, value, options = {}) {
  return validateConfig({ [key]: value }, { ...options, partial: true });
}

export function validateConfig(data, { mode = "strict", partial = false } = {}) {
  const context = { mode, issues: [] };
  if (!isObject(data)) return { valid: false, issues: [issue("", "type", "object", data)], data: getDefaultConfig() };

  for (const key of Object.keys(data)) {
    if (!Object.hasOwn(CONFIG_SCHEMA, key)) {
      context.issues.push(issue(key, "unknown", "known section", data[key]));
    }
  }

  const output = {};
  for (const [key, descriptor] of Object.entries(CONFIG_SCHEMA)) {
    if (Object.hasOwn(data, key)) output[key] = validateNode(data[key], descriptor, key, context);
    else if (!partial) output[key] = clone(descriptor.defaultValue);
  }
  return {
    valid: context.issues.length === 0,
    issues: context.issues,
    data: output,
  };
}

export function sanitizeConfig(data, options = {}) {
  return validateConfig(data, { ...options, mode: options.mode || "tolerant" });
}
