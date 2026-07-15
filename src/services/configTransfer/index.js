import { config } from "../../config.js";
import {
  getConfigPathMetadata,
  getExportableConfigKeys,
  validateConfig,
} from "../../config/schema.js";
import { CONFIG_SCHEMA_VERSION } from "../../config/persistence.js";
import { updateConfig } from "../settingsService.js";

export const CONFIG_TRANSFER_FORMAT_VERSION = 1;

const DOCUMENT_METADATA_KEYS = Object.freeze([
  "formatVersion",
  "schemaVersion",
  "applicationVersion",
  "exportedAt",
]);
const LEGACY_IMPORT_KEYS = Object.freeze(["minVersion"]);
const LEGACY_THREAD_KEYS = Object.freeze([
  "skipMaskedLink",
  "directDownloadLinks",
  "directDownloadPackages",
  "directDownloadHealth",
]);

function issue(path, code, expected, value) {
  return {
    path: String(path || ""),
    code,
    expected,
    receivedType: Array.isArray(value) ? "array" : value === null ? "null" : typeof value,
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function applicationVersion() {
  const version = globalThis.GM_info?.script?.version;
  return typeof version === "string" && version.trim() ? version.trim() : "unknown";
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function diffPaths(before, after, prefix = "") {
  if (Object.is(before, after)) return [];
  const beforeObject = before && typeof before === "object";
  const afterObject = after && typeof after === "object";
  if (!beforeObject || !afterObject || Array.isArray(before) !== Array.isArray(after)) return [prefix];

  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].flatMap((key) => diffPaths(
    before[key],
    after[key],
    prefix ? `${prefix}.${key}` : key,
  ));
}

function mergePartial(previous, next) {
  if (!isPlainObject(previous) || !isPlainObject(next)) return clone(next);
  const merged = clone(previous);
  for (const [key, value] of Object.entries(next)) {
    merged[key] = isPlainObject(merged[key]) && isPlainObject(value)
      ? mergePartial(merged[key], value)
      : clone(value);
  }
  return merged;
}

function normalizePositiveInteger(value) {
  if (Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number.parseInt(value.trim(), 10);
    return parsed > 0 ? parsed : value;
  }
  return value;
}

function normalizeLegacyTags(value) {
  const entries = Array.isArray(value)
    ? value
    : isPlainObject(value)
      ? Object.entries(value).map(([name, id]) => ({ [name]: id }))
      : value;
  if (!Array.isArray(entries)) return entries;

  return entries.map((entry) => {
    if (!isPlainObject(entry)) return entry;
    const id = normalizePositiveInteger(entry.id);
    const name = typeof entry.name === "string" ? entry.name.trim() : entry.name;
    if (id !== undefined && name !== undefined) return { ...entry, id, name };

    const pairs = Object.entries(entry);
    if (pairs.length !== 1) return entry;
    const [key, rawValue] = pairs[0];
    const idFromValue = normalizePositiveInteger(rawValue);
    if (typeof idFromValue === "number" && String(key).trim()) {
      return { id: idFromValue, name: String(key).trim() };
    }
    const idFromKey = normalizePositiveInteger(key);
    if (typeof idFromKey === "number" && typeof rawValue === "string" && rawValue.trim()) {
      return { id: idFromKey, name: rawValue.trim() };
    }
    return entry;
  });
}

function normalizeLegacyIdArray(value) {
  const entries = Array.isArray(value)
    ? value
    : isPlainObject(value)
      ? Object.values(value)
      : value;
  return Array.isArray(entries) ? entries.map(normalizePositiveInteger) : entries;
}

function normalizeImportSettings(settings) {
  const normalized = clone(settings);
  if (!isPlainObject(normalized)) return normalized;
  if (Object.hasOwn(normalized, "tags")) normalized.tags = normalizeLegacyTags(normalized.tags);
  for (const key of ["preferredTags", "excludedTags", "markedTags"]) {
    if (Object.hasOwn(normalized, key)) normalized[key] = normalizeLegacyIdArray(normalized[key]);
  }
  return normalized;
}

function normalizeLegacyTransferSettings(settings) {
  const normalized = normalizeImportSettings(settings);
  if (!isPlainObject(normalized)) return normalized;
  if (typeof normalized.minVersion === "number") {
    const latestSettings = isPlainObject(normalized.latestSettings) ? normalized.latestSettings : {};
    if (!Object.hasOwn(latestSettings, "minVersion")) {
      normalized.latestSettings = { ...latestSettings, minVersion: normalized.minVersion };
    }
    delete normalized.minVersion;
  }
  if (isPlainObject(normalized.threadSettings)) {
    normalized.threadSettings = { ...normalized.threadSettings };
    for (const key of LEGACY_THREAD_KEYS) delete normalized.threadSettings[key];
  }
  return normalized;
}

function parseDocument(input) {
  if (typeof input !== "string") return { value: input, issues: [] };
  try {
    return { value: JSON.parse(input), issues: [] };
  } catch {
    return { value: null, issues: [issue("", "invalid_json", "valid JSON object", input)] };
  }
}

function readDocument(input) {
  const parsed = parseDocument(input);
  if (parsed.issues.length > 0) return { ok: false, issues: parsed.issues, warnings: [] };
  if (!isPlainObject(parsed.value)) {
    return { ok: false, issues: [issue("", "type", "JSON object", parsed.value)], warnings: [] };
  }

  const source = parsed.value;
  const hasSettingsRoot = Object.hasOwn(source, "settings");
  const metadata = {};
  const issues = [];
  for (const key of DOCUMENT_METADATA_KEYS) {
    if (Object.hasOwn(source, key)) metadata[key] = source[key];
  }

  const allowedRootKeys = new Set(hasSettingsRoot
    ? ["settings", ...DOCUMENT_METADATA_KEYS]
    : [...DOCUMENT_METADATA_KEYS, ...getExportableConfigKeys(), ...LEGACY_IMPORT_KEYS]);
  for (const key of Object.keys(source)) {
    if (!allowedRootKeys.has(key)) issues.push(issue(key, "unsupported", "supported transfer field", source[key]));
  }

  const formatVersion = Object.hasOwn(metadata, "formatVersion") ? metadata.formatVersion : 0;
  if (!Number.isInteger(formatVersion) || formatVersion < 0) {
    issues.push(issue("formatVersion", "version", `integer between 0 and ${CONFIG_TRANSFER_FORMAT_VERSION}`, formatVersion));
  } else if (formatVersion > CONFIG_TRANSFER_FORMAT_VERSION) {
    issues.push(issue("formatVersion", "unsupported", `version <= ${CONFIG_TRANSFER_FORMAT_VERSION}`, formatVersion));
  }
  if (formatVersion >= CONFIG_TRANSFER_FORMAT_VERSION && Object.hasOwn(source, "minVersion")) {
    issues.push(issue("minVersion", "unsupported", "supported transfer field", source.minVersion));
  }

  const schemaVersion = Object.hasOwn(metadata, "schemaVersion") ? metadata.schemaVersion : 0;
  if (!Number.isInteger(schemaVersion) || schemaVersion < 0) {
    issues.push(issue("schemaVersion", "version", `integer between 0 and ${CONFIG_SCHEMA_VERSION}`, schemaVersion));
  } else if (schemaVersion > CONFIG_SCHEMA_VERSION) {
    issues.push(issue("schemaVersion", "unsupported", `version <= ${CONFIG_SCHEMA_VERSION}`, schemaVersion));
  }

  if (Object.hasOwn(metadata, "exportedAt") && typeof metadata.exportedAt !== "string") {
    issues.push(issue("exportedAt", "type", "ISO date string", metadata.exportedAt));
  }
  if (Object.hasOwn(metadata, "exportedAt") && typeof metadata.exportedAt === "string" && Number.isNaN(Date.parse(metadata.exportedAt))) {
    issues.push(issue("exportedAt", "format", "ISO date string", metadata.exportedAt));
  }
  if (Object.hasOwn(metadata, "applicationVersion") && typeof metadata.applicationVersion !== "string") {
    issues.push(issue("applicationVersion", "type", "version string", metadata.applicationVersion));
  }

  const settings = hasSettingsRoot ? source.settings : Object.fromEntries(
    getExportableConfigKeys()
      .filter((key) => Object.hasOwn(source, key))
      .map((key) => [key, source[key]]),
  );
  if (!hasSettingsRoot && formatVersion === 0 && Object.hasOwn(source, "minVersion")) settings.minVersion = source.minVersion;
  if (!isPlainObject(settings)) issues.push(issue("settings", "type", "object", settings));

  const exportable = new Set(getExportableConfigKeys());
  if (isPlainObject(settings)) {
    for (const key of Object.keys(settings)) {
      if (!exportable.has(key) && !(formatVersion === 0 && LEGACY_IMPORT_KEYS.includes(key))) {
        issues.push(issue(`settings.${key}`, "not_exportable", "schema-exportable setting", settings[key]));
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    warnings: [],
    formatVersion,
    schemaVersion,
    settings: normalizeImportSettings(settings),
    migrated: formatVersion < CONFIG_TRANSFER_FORMAT_VERSION || schemaVersion < CONFIG_SCHEMA_VERSION,
  };
}

function buildCandidate(settings) {
  const candidate = clone(config);
  for (const [key, value] of Object.entries(settings)) {
    candidate[key] = mergePartial(candidate[key], value);
  }
  return candidate;
}

function reloadRequired(changedPaths) {
  return changedPaths.some((path) => getConfigPathMetadata(path)?.reloadRequired);
}

export function buildConfigExport({ exportedAt = new Date() } = {}) {
  const settings = Object.fromEntries(getExportableConfigKeys().map((key) => [key, clone(config[key])]));
  return {
    formatVersion: CONFIG_TRANSFER_FORMAT_VERSION,
    schemaVersion: CONFIG_SCHEMA_VERSION,
    applicationVersion: applicationVersion(),
    exportedAt: new Date(exportedAt).toISOString(),
    settings,
  };
}

export function previewConfigImport(input) {
  const document = readDocument(input);
  if (!document.ok) return { ok: false, issues: document.issues, warnings: document.warnings };
  if (Object.keys(document.settings).length === 0) {
    return { ok: false, issues: [issue("settings", "empty", "at least one exportable setting", document.settings)], warnings: document.warnings };
  }

  let settings = document.settings;
  const warnings = [...document.warnings];
  if (document.schemaVersion < CONFIG_SCHEMA_VERSION || document.formatVersion < CONFIG_TRANSFER_FORMAT_VERSION) {
    const legacyValidationInput = normalizeLegacyTransferSettings(settings);
    if (isPlainObject(legacyValidationInput)) {
      for (const key of LEGACY_IMPORT_KEYS) delete legacyValidationInput[key];
    }
    const legacyValidation = validateConfig(legacyValidationInput, { mode: "strict", partial: true });
    if (!legacyValidation.valid) return { ok: false, issues: legacyValidation.issues, warnings };
    try {
      settings = normalizeLegacyTransferSettings(settings);
      warnings.push({ code: "migrated", message: "A supported legacy configuration format was normalized." });
    } catch {
      return { ok: false, issues: [issue("schemaVersion", "migration_failed", "supported configuration format", document.schemaVersion)], warnings };
    }
  }

  const validation = validateConfig(settings, { mode: "strict", partial: true });
  if (!validation.valid) return { ok: false, issues: validation.issues, warnings };
  const candidate = buildCandidate(validation.data);
  const completeValidation = validateConfig(candidate, { mode: "strict" });
  if (!completeValidation.valid) return { ok: false, issues: completeValidation.issues, warnings };

  const changedPaths = [...new Set(diffPaths(config, completeValidation.data).filter(Boolean))].sort();
  return {
    ok: true,
    candidate: completeValidation.data,
    changedPaths,
    changedSections: [...new Set(changedPaths.map((path) => path.match(/^[^.[\]]+/)?.[0] || path))],
    warnings,
    formatVersion: document.formatVersion,
    schemaVersion: document.schemaVersion,
    migrated: document.migrated,
    reloadRequired: reloadRequired(changedPaths),
  };
}

export async function commitConfigImport(input) {
  const preview = previewConfigImport(input);
  if (!preview.ok) return preview;
  const result = await updateConfig((draft) => {
    for (const section of preview.changedSections || []) {
      draft[section] = clone(preview.candidate[section]);
    }
  }, { origin: "import" });
  if (!result.committed) return { ...preview, ...result, ok: false };
  return {
    ...preview,
    ...result,
    ok: true,
    reloadRequired: reloadRequired(result.changedPaths || preview.changedPaths),
  };
}
