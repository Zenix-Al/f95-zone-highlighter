import { config } from "../config/state.js";
import { getByPath } from "../utils/objectPath.js";
import { reportFeatureWarning } from "../core/featureHealth.js";
import { applyEffects } from "../ui/renderers/applyEffects.js";
import { getMetadataByConfigPath } from "../ui/settings/metaRegistry.js";

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function changedPaths(before, after, prefix = "") {
  if (Object.is(before, after)) return [];
  if (!before || !after || typeof before !== "object" || typeof after !== "object") return [prefix];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].flatMap((key) => changedPaths(before[key], after[key], prefix ? `${prefix}.${key}` : key));
}

export function applyConfigChange(nextConfig, { origin = "local" } = {}) {
  const previous = clone(config);
  const next = clone(nextConfig);
  const paths = [...new Set(changedPaths(previous, next).filter(Boolean))];
  Object.assign(config, next);
  for (const path of paths) {
    const meta = getMetadataByConfigPath(path);
    if (!meta) continue;
    try { applyEffects(meta, getByPath(config, path)); } catch (error) { reportFeatureWarning("Config", error, `effect:${path}:${origin}`); }
  }
  return { previous, config: clone(config), changedPaths: paths, origin };
}
