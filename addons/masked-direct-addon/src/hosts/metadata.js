export const DIRECT_DOWNLOAD_HOSTS = Object.freeze([
  {
    id: "buzzheavier",
    canonicalHost: "buzzheavier.com",
    hostIncludes: ["buzzheavier.com", "bzzhr.to"],
    text: "Buzzheavier",
    tooltip:
      "Enable direct download automation for buzzheavier.com and bzzhr.to",
  },
  {
    id: "gofile",
    canonicalHost: "gofile.io",
    hostIncludes: ["gofile.io"],
    text: "Gofile package",
    tooltip: "Enable direct download automation for gofile.io",
  },
  {
    id: "pixeldrain",
    canonicalHost: "pixeldrain.com",
    hostIncludes: ["pixeldrain.com"],
    text: "Pixeldrain",
    tooltip: "Enable direct download automation for pixeldrain.com",
  },
  {
    id: "datanodes",
    canonicalHost: "datanodes.to",
    hostIncludes: ["datanodes.to"],
    text: "Datanodes",
    tooltip: "Enable direct download automation for datanodes.to",
  },
  {
    id: "mediafire",
    canonicalHost: "mediafire.com",
    hostIncludes: ["mediafire.com"],
    text: "MediaFire",
    tooltip: "Enable direct download automation for mediafire.com",
  },
  {
    id: "workupload",
    canonicalHost: "workupload.com",
    hostIncludes: ["workupload.com"],
    text: "Workupload",
    tooltip: "Enable direct download automation for workupload.com",
  },
]);

export const DIRECT_DOWNLOAD_HOST_MATCHERS = Object.freeze(
  DIRECT_DOWNLOAD_HOSTS.flatMap((host) => host.hostIncludes),
);

function normalizeHostname(hostname) {
  return String(hostname || "").toLowerCase();
}

export function findDirectDownloadHost(hostname) {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return null;
  return (
    DIRECT_DOWNLOAD_HOSTS.find((host) =>
      host.hostIncludes.some((entry) => normalized.includes(entry)),
    ) || null
  );
}

export function normalizeDirectDownloadHost(hostname) {
  return findDirectDownloadHost(hostname)?.canonicalHost || "";
}

export function isSupportedDirectDownloadHost(hostname) {
  return Boolean(findDirectDownloadHost(hostname));
}

export function createDirectDownloadPackageDefaults() {
  return Object.fromEntries(
    DIRECT_DOWNLOAD_HOSTS.map((host) => [host.id, true]),
  );
}

export function coerceDirectDownloadPackages(packages = {}) {
  const source = packages && typeof packages === "object" ? packages : {};
  return Object.fromEntries(
    DIRECT_DOWNLOAD_HOSTS.map((host) => [host.id, source[host.id] !== false]),
  );
}

export function createDirectDownloadPanelSettings() {
  return DIRECT_DOWNLOAD_HOSTS.map((host) => ({
    id: host.id,
    path: `directDownloadPackages.${host.id}`,
    text: host.text,
    tooltip: host.tooltip,
  }));
}

export function isDirectDownloadHostEnabled(hostname, packages) {
  const host = findDirectDownloadHost(hostname);
  if (!host) return true;
  if (!packages || typeof packages !== "object") return true;
  return packages[host.id] !== false;
}
