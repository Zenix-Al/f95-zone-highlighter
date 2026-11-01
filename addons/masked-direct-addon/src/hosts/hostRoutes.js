import { DIRECT_DOWNLOAD_HOSTS } from "./metadata.js";
import { findHostRoute } from "./shared/routes.js";

const byHost = new Map(
  DIRECT_DOWNLOAD_HOSTS.map((definition) => [definition.canonicalHost, definition]),
);
export function classifyHostRoute(host, url = location.href) {
  const definition = byHost.get(String(host || ""));
  if (!definition) return { eligible: false, reason: "host_not_standalone_approved" };
  const route = findHostRoute(definition, url);
  return route && route.rule.allow !== false
    ? { eligible: true, reason: "standalone_safe_route" }
    : { eligible: false, reason: "unsafe_or_unsupported_route" };
}
export function getApprovedHosts() {
  return Object.freeze([...byHost.keys()]);
}
function describe(host, url, role) {
  const definition = byHost.get(String(host || ""));
  return definition ? findHostRoute(definition, url, role)?.stage || null : null;
}
export const describeHostEntry = (host, url = location.href) => describe(host, url, "entry");
export const describeHostContinuation = (host, url = location.href) =>
  describe(host, url, "continuation");
