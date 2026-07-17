export const SUPPORTED_ADDON_PAGE_SCOPES = Object.freeze([
  "f95zone",
  "thread",
  "latest",
]);

export const ADDON_RUNTIME_MODES = Object.freeze([
  "core-required",
  "standalone",
  "hybrid",
]);

const SUPPORTED_SCOPE_SET = new Set(SUPPORTED_ADDON_PAGE_SCOPES);
const RUNTIME_MODE_SET = new Set(ADDON_RUNTIME_MODES);
const F95ZONE_SAMPLE_URLS = Object.freeze([
  "https://f95zone.to/",
  "https://f95zone.to/threads/example.1/",
  "https://f95zone.to/sam/latest_alpha/",
  "https://f95zone.to/masked/example/",
]);

function normalizeMatchPattern(pattern) {
  return String(pattern || "").trim();
}

function matchPath(pathname, pattern) {
  const escaped = String(pattern || "")
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(pathname);
}

export function matchesUserscriptPattern(url, pattern) {
  const normalizedPattern = normalizeMatchPattern(pattern);
  if (!normalizedPattern || !url) return false;
  if (normalizedPattern === "<all_urls>") return /^(https?|file):/i.test(String(url));

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return false;
  }

  const match = normalizedPattern.match(/^(\*|https?|file):\/\/([^/]+)(\/.*)?$/i);
  if (!match) return false;

  const [, schemePattern, hostPattern, pathPattern = "/*"] = match;
  if (schemePattern !== "*" && schemePattern.toLowerCase() !== parsedUrl.protocol.slice(0, -1)) {
    return false;
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const normalizedHostPattern = hostPattern.toLowerCase();
  if (normalizedHostPattern.startsWith("*.")) {
    const suffix = normalizedHostPattern.slice(1);
    if (hostname !== suffix.slice(1) && !hostname.endsWith(suffix)) return false;
  } else if (normalizedHostPattern !== hostname && normalizedHostPattern !== "*") {
    return false;
  }

  return matchPath(`${parsedUrl.pathname}${parsedUrl.search}`, pathPattern);
}

export function matchesAnyUserscriptPattern(url, patterns) {
  return Array.isArray(patterns) && patterns.some((pattern) => matchesUserscriptPattern(url, pattern));
}

export function normalizeAddonPageScopes(value) {
  const values = value instanceof Set ? [...value] : value;
  if (!Array.isArray(values)) return [];
  return values.map((scope) => String(scope || "").trim().toLowerCase());
}

export function resolveScopeIntersection(pageScopes, currentScopes) {
  const requested = new Set(normalizeAddonPageScopes(pageScopes));
  const current = new Set(normalizeAddonPageScopes(currentScopes));
  return SUPPORTED_ADDON_PAGE_SCOPES.filter((scope) => requested.has(scope) && current.has(scope));
}

export function scopeAppliesToCurrentPage(pageScopes, currentScopes) {
  const normalized = normalizeAddonPageScopes(pageScopes);
  if (normalized.length === 0) return true;
  return resolveScopeIntersection(normalized, currentScopes).length > 0;
}

export function hasF95ZoneActivationMatch(matches) {
  return Array.isArray(matches) && F95ZONE_SAMPLE_URLS.some((url) => matchesAnyUserscriptPattern(url, matches));
}

export function hasStandaloneActivationMatch(matches) {
  if (!Array.isArray(matches)) return false;
  return matches.some((pattern) =>
    !F95ZONE_SAMPLE_URLS.some((url) => matchesUserscriptPattern(url, pattern)),
  );
}

export function validateAddonRuntimeMetadata(addon, { registration = false } = {}) {
  const errors = [];
  const runtimeMode = String(addon?.runtimeMode || "").trim().toLowerCase();
  const pageScopes = normalizeAddonPageScopes(addon?.pageScopes);
  const matches = Array.isArray(addon?.matches) ? addon.matches.map(normalizeMatchPattern) : [];

  if (!RUNTIME_MODE_SET.has(runtimeMode)) {
    errors.push("invalid_runtime_mode");
  }

  if (!Array.isArray(addon?.pageScopes)) {
    errors.push("missing_page_scopes");
  }

  if (pageScopes.some((scope) => !scope)) errors.push("empty_page_scope");
  if (new Set(pageScopes).size !== pageScopes.length) errors.push("duplicate_page_scope");
  if (pageScopes.some((scope) => !SUPPORTED_SCOPE_SET.has(scope))) errors.push("unknown_page_scope");

  if (runtimeMode !== "standalone" && pageScopes.length === 0) {
    errors.push("missing_core_page_scope");
  }
  if (runtimeMode === "standalone" && pageScopes.length > 0) {
    errors.push("standalone_page_scope");
  }

  if (!Array.isArray(addon?.matches) || matches.length === 0) {
    errors.push("missing_activation_matches");
  }

  const requiresCore = Boolean(addon?.requiresCore);
  if (runtimeMode === "standalone" && requiresCore) errors.push("contradictory_requires_core");
  if (runtimeMode !== "standalone" && !requiresCore) errors.push("contradictory_requires_core");

  if (runtimeMode === "core-required" && !hasF95ZoneActivationMatch(matches)) {
    errors.push("core_required_without_f95zone_match");
  }
  if (runtimeMode === "hybrid") {
    if (!hasF95ZoneActivationMatch(matches)) errors.push("hybrid_without_f95zone_match");
    if (!hasStandaloneActivationMatch(matches)) errors.push("hybrid_without_standalone_match");
  }
  if (registration && runtimeMode === "standalone") errors.push("standalone_must_not_register");

  return errors.length > 0
    ? { ok: false, reason: "invalid_registration", errors: [...new Set(errors)] }
    : { ok: true, runtimeMode, pageScopes, matches };
}

const CORE_PAGE_SCOPE_FLAGS = Object.freeze([
  ["f95zone", "isF95Zone"],
  ["thread", "isThread"],
  ["latest", "isLatest"],
]);

export function getCurrentAddonPageScopes(stateManager) {
  return CORE_PAGE_SCOPE_FLAGS
    .filter(([, stateKey]) => stateManager.get(stateKey))
    .map(([scope]) => scope);
}

export function getAddonAvailabilityBlockReason(access) {
  if (access?.availabilityReason === "activation_mismatch") return "addon_activation_mismatch";
  if (access?.availabilityReason === "out_of_scope") return "addon_out_of_scope";
  return null;
}
