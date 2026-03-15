import { createFeature } from "./featureFactory.js";
import { acquireStyle, removeStyle } from "./styleRegistry.js";

function resolveStyleId(name, explicitId) {
  if (typeof explicitId === "string" && explicitId.trim().length > 0) {
    return explicitId.trim();
  }
  const slug = String(name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `feature-${slug || "unnamed"}`;
}

export const createStyledFeature = (
  name,
  {
    configPath,
    isEnabled,
    isApplicable,
    styleId,
    styleCss,
    styleTarget = "document",
    enable,
    disable,
  },
) => {
  const resolvedStyleId = resolveStyleId(name, styleId);
  return createFeature(name, {
    configPath,
    isEnabled,
    isApplicable,
    enable: () => {
      acquireStyle(resolvedStyleId, styleCss, styleTarget);
      return enable ? enable() : null;
    },
    disable: () => {
      const result = disable ? disable() : null;
      if (result && typeof result.then === "function") {
        return Promise.resolve(result).finally(() => removeStyle(resolvedStyleId));
      }
      removeStyle(resolvedStyleId);
      return result;
    },
  });
};
