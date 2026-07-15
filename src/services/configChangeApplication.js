import { config } from "../config/state.js";
import { getConfigPathMetadata } from "../config/schema.js";
import { getByPath } from "../utils/objectPath.js";
import { reportFeatureWarning } from "../core/featureHealth.js";
import { applyEffects } from "../ui/renderers/applyEffects.js";
import { getMetadataByConfigPath } from "../ui/settings/metaRegistry.js";

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function valueAtPath(value, path) {
  return getByPath(value, path.replace(/\[(\d+)\]/g, ".$1"));
}

function pathDepth(path) {
  return path.split(".").reduce((depth, segment) => depth + 1 + (segment.match(/\[\d+\]/g) || []).length, 0);
}

function changedPaths(before, after, prefix = "") {
  if (Object.is(before, after)) return [];
  if ((before === undefined || before === null) && after && typeof after === "object") {
    const keys = Object.keys(after);
    return keys.length > 0
      ? keys.flatMap((key) => changedPaths(undefined, after[key], `${prefix}${Array.isArray(after) ? `[${key}]` : `${prefix ? "." : ""}${key}`}`))
      : [prefix];
  }
  if ((after === undefined || after === null) && before && typeof before === "object") {
    const keys = Object.keys(before);
    return keys.length > 0
      ? keys.flatMap((key) => changedPaths(before[key], undefined, `${prefix}${Array.isArray(before) ? `[${key}]` : `${prefix ? "." : ""}${key}`}`))
      : [prefix];
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const keys = new Set([...before.keys(), ...after.keys()]);
    return [...keys].flatMap((index) => changedPaths(before[index], after[index], `${prefix}[${index}]`));
  }
  if (!before || !after || typeof before !== "object" || typeof after !== "object" || Array.isArray(before) || Array.isArray(after)) {
    return [prefix];
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].flatMap((key) => changedPaths(before[key], after[key], prefix ? `${prefix}.${key}` : key));
}

function sortChangedPaths(paths) {
  return [...new Set(paths.filter(Boolean))].sort((a, b) => pathDepth(a) - pathDepth(b) || a.localeCompare(b));
}

function reportEffectFailure(path, error, origin) {
  reportFeatureWarning("Config", error, `effect:${path}:${origin}`);
}

function invokeEffect(meta, path, value, origin, notify) {
  try {
    const pending = applyEffects(meta, value, { origin, notify });
    return pending && typeof pending.then === "function"
      ? pending.catch((error) => reportEffectFailure(path, error, origin))
      : null;
  } catch (error) {
    reportEffectFailure(path, error, origin);
    return null;
  }
}

export function applyConfigChange(
  nextConfig,
  {
    origin = "local",
    reloadRequired = null,
    notify = true,
  } = {},
) {
  const previous = clone(config);
  const requestedNext = clone(nextConfig);
  const next = requestedNext;
  const paths = sortChangedPaths(changedPaths(previous, next));
  Object.assign(config, next);

  const effectPromises = [];
  const invokedEffects = new Set();
  for (const path of paths) {
    const schemaMetadata = getConfigPathMetadata(path);
    const metadata = getMetadataByConfigPath(path);
    if (metadata && !invokedEffects.has(metadata.id)) {
      invokedEffects.add(metadata.id);
      const pending = invokeEffect(metadata, path, valueAtPath(config, path), origin, notify);
      if (pending) effectPromises.push(pending);
    }

    if (schemaMetadata?.reloadRequired && typeof reloadRequired === "function") {
      try {
        const pending = reloadRequired(path, valueAtPath(config, path), { origin });
        if (pending && typeof pending.then === "function") effectPromises.push(pending.catch((error) => reportEffectFailure(path, error, origin)));
      } catch (error) {
        reportEffectFailure(path, error, origin);
      }
    }
  }

  return {
    previous,
    config: clone(config),
    changedPaths: paths,
    appliedPaths: paths,
    origin,
    effects: Promise.all(effectPromises),
  };
}
