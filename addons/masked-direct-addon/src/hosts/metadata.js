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
    id: "googleDrive",
    canonicalHost: "drive.google.com",
    hostIncludes: ["drive.google.com", "drive.usercontent.google.com"],
    text: "Google Drive",
    tooltip: "Enable direct download automation for Google Drive",
  },
  {
    id: "pixeldrain",
    canonicalHost: "pixeldrain.com",
    hostIncludes: ["pixeldrain.com"],
    text: "Pixeldrain",
    tooltip: "Enable direct download automation for pixeldrain.com",
  },
  {
    id: "krakenfiles",
    canonicalHost: "krakenfiles.com",
    hostIncludes: ["krakenfiles.com"],
    text: "KrakenFiles",
    tooltip: "Enable direct download automation for krakenfiles.com",
  },
  {
    id: "datanodes",
    canonicalHost: "datanodes.to",
    hostIncludes: ["datanodes.to"],
    text: "Datanodes",
    tooltip: "Enable direct download automation for datanodes.to",
  },
  {
    id: "delafil",
    canonicalHost: "delafil.se",
    hostIncludes: ["delafil.se"],
    text: "DelaFil",
    tooltip: "Enable direct download automation for delafil.se",
  },
  {
    id: "downloadgg",
    canonicalHost: "download.gg",
    hostIncludes: ["download.gg"],
    text: "download.gg",
    tooltip: "Enable direct download automation for download.gg",
  },
  {
    id: "vik1ngfile",
    canonicalHost: "vik1ngfile.site",
    hostIncludes: ["vik1ngfile.site", "vikingfile.com"],
    text: "Vik1ngFile",
    tooltip:
      "Enable direct download automation for vik1ngfile.site and vikingfile.com",
  },
  {
    id: "mediafire",
    canonicalHost: "mediafire.com",
    hostIncludes: ["mediafire.com"],
    text: "MediaFire",
    tooltip: "Enable direct download automation for mediafire.com",
  },
  {
    id: "mixdrop",
    canonicalHost: "miiiixdrop.net",
    hostIncludes: ["mixdrop.ag", "miiixdrop.net", "miiiixdrop.net"],
    text: "MixDrop",
    tooltip: "Enable two-stage direct download automation for MixDrop",
  },
  {
    id: "uploadhaven",
    canonicalHost: "uploadhaven.com",
    hostIncludes: ["uploadhaven.com"],
    text: "UploadHaven",
    tooltip: "Enable direct download automation for uploadhaven.com",
  },
  {
    id: "uploadnow",
    canonicalHost: "uploadnow.io",
    hostIncludes: ["uploadnow.io"],
    text: "UploadNow",
    tooltip: "Enable single-file direct download automation for uploadnow.io",
  },
  {
    id: "workupload",
    canonicalHost: "workupload.com",
    hostIncludes: ["workupload.com"],
    text: "Workupload",
    tooltip: "Enable direct download automation for workupload.com",
  },
]);

const DIRECT_DOWNLOAD_HOST_INDEX = new Map(
  DIRECT_DOWNLOAD_HOSTS.flatMap((host) =>
    host.hostIncludes.map((hostname) => [hostname, host]),
  ),
);

function normalizeHostname(hostname) {
  return String(hostname || "").toLowerCase();
}

export function findDirectDownloadHost(hostname) {
  let normalized = normalizeHostname(hostname);
  if (!normalized) return null;
  while (normalized) {
    const host = DIRECT_DOWNLOAD_HOST_INDEX.get(normalized);
    if (host) return host;
    const dot = normalized.indexOf(".");
    if (dot < 0) break;
    normalized = normalized.slice(dot + 1);
  }
  return null;
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
