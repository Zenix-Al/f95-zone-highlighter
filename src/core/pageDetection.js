import { pageDefinitions, stateManager } from "../config.js";
import { debugLog } from "./logger.js";

function normalizeRuleEntries(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  const normalized = String(value || "").trim();
  return normalized ? [normalized] : [];
}

function matchAny(value, candidates, matcher) {
  const entries = normalizeRuleEntries(candidates);
  if (entries.length === 0) return true;
  return entries.some((entry) => matcher(value, entry));
}

export function matchesPageDefinition(definition, locationLike = location) {
  const rule = definition && typeof definition === "object" ? definition : {};
  const host = String(locationLike?.hostname || "");
  const path = String(locationLike?.pathname || "");
  const href = String(locationLike?.href || "");

  if (!matchAny(host, rule.hostIncludes, (value, entry) => value.includes(entry))) return false;
  if (!matchAny(host, rule.hostEquals, (value, entry) => value === entry)) return false;
  if (!matchAny(path, rule.pathStartsWith, (value, entry) => value.startsWith(entry))) return false;
  if (!matchAny(path, rule.pathEquals, (value, entry) => value === entry)) return false;
  if (!matchAny(href, rule.hrefIncludes, (value, entry) => value.includes(entry))) return false;

  if (rule.pathPattern) {
    const patterns = Array.isArray(rule.pathPattern) ? rule.pathPattern : [rule.pathPattern];
    const hasPatternMatch = patterns.some((pattern) => {
      if (pattern instanceof RegExp) return pattern.test(path);
      try {
        return new RegExp(String(pattern)).test(path);
      } catch {
        return false;
      }
    });
    if (!hasPatternMatch) return false;
  }

  if (typeof rule.match === "function") {
    return Boolean(rule.match(locationLike));
  }

  return true;
}

export function detectPage(locationLike = location) {
  const detected = {};

  for (const key of Object.keys(pageDefinitions)) {
    const value = matchesPageDefinition(pageDefinitions[key], locationLike);
    stateManager.set(key, value);
    detected[key] = value;
  }

  debugLog("PageDetect", "Page state detected", { data: detected, level: "info" });
  return detected;
}
