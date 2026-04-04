import { config, downloadHostConfigs } from "../../config.js";
import { getDirectDownloadHostHealth } from "./hostBreaker.js";

function normalizeHost(hostname) {
  return String(hostname || "")
    .trim()
    .toLowerCase();
}

function findDirectDownloadHostEntry(hostname) {
  const host = normalizeHost(hostname);
  if (!host) return null;
  for (const key in downloadHostConfigs) {
    if (!host.includes(key)) continue;
    return { host: key, config: downloadHostConfigs[key] };
  }
  return null;
}

export function resolveDirectDownloadHost(hostname) {
  return findDirectDownloadHostEntry(hostname);
}

export function getDirectDownloadHostContext(hostname, { requireEnabled = false } = {}) {
  const resolved = findDirectDownloadHostEntry(hostname);
  if (!resolved) return null;

  const packageKey = resolved.config?.packageKey || null;
  const enabled = isDirectDownloadPackageEnabled(packageKey);

  if (requireEnabled && !enabled) {
    return null;
  }

  return {
    ...resolved,
    packageKey,
    enabled,
  };
}

export function getDirectDownloadPackageKeyForHost(hostname) {
  return getDirectDownloadHostContext(hostname)?.packageKey || null;
}

export function isDirectDownloadPackageEnabled(packageKey) {
  if (!packageKey) return true;
  const hostHealth = getDirectDownloadHostHealth(packageKey);
  if (hostHealth?.autoDisabled) return false;
  const packages = config.threadSettings?.directDownloadPackages;
  if (!packages || typeof packages !== "object") return true;
  return packages[packageKey] !== false;
}

export function isDirectDownloadHostEnabled(hostname) {
  return Boolean(getDirectDownloadHostContext(hostname, { requireEnabled: true }));
}
