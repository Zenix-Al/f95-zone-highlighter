import { config, downloadHostConfigs } from "../../config.js";

function normalizeHost(hostname) {
  return String(hostname || "").trim().toLowerCase();
}

export function resolveDirectDownloadHost(hostname) {
  const host = normalizeHost(hostname);
  if (!host) return null;
  for (const key in downloadHostConfigs) {
    if (!host.includes(key)) continue;
    return { host: key, config: downloadHostConfigs[key] };
  }
  return null;
}

export function getDirectDownloadPackageKeyForHost(hostname) {
  return resolveDirectDownloadHost(hostname)?.config?.packageKey || null;
}

export function isDirectDownloadPackageEnabled(packageKey) {
  if (!packageKey) return true;
  const packages = config.threadSettings?.directDownloadPackages;
  if (!packages || typeof packages !== "object") return true;
  return packages[packageKey] !== false;
}

export function isDirectDownloadHostEnabled(hostname) {
  const packageKey = getDirectDownloadPackageKeyForHost(hostname);
  return isDirectDownloadPackageEnabled(packageKey);
}

