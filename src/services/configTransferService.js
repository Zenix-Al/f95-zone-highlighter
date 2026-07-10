import { config } from "../config.js";
import { getExportableConfigKeys, validateConfig } from "../config/schema.js";
import { commitConfig } from "./settingsService.js";
import { normalizeImportRoot } from "../features/config-transfer/transferIO.js";

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function diffPaths(before, after, prefix = "") {
  if (Object.is(before, after)) return [];
  if (!before || !after || typeof before !== "object" || typeof after !== "object") return [prefix];
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap((key) => diffPaths(before[key], after[key], prefix ? `${prefix}.${key}` : key));
}

export function buildConfigExport() {
  const settings = Object.fromEntries(getExportableConfigKeys().map((key) => [key, clone(config[key])]));
  return { formatVersion: 1, settings };
}

export function previewConfigImport(parsed) {
  const payload = normalizeImportRoot(parsed);
  const validation = validateConfig(payload, { mode: "strict", partial: true });
  if (!validation.valid) return { ok: false, issues: validation.issues, warnings: [] };
  const candidate = { ...clone(config), ...validation.data };
  return { ok: true, candidate, changedPaths: diffPaths(config, candidate), changedSections: Object.keys(validation.data), warnings: [] };
}

export async function commitConfigImport(parsed) {
  const preview = previewConfigImport(parsed);
  if (!preview.ok) return preview;
  const result = await commitConfig(preview.candidate, { origin: "import" });
  return { ...preview, ...result };
}
