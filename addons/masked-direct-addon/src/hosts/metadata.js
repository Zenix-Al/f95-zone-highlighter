import { processBuzzheavierDownload } from "./buzzheavier.js";
import { processGofileDownload } from "./gofile.js";
import { processGoogleDriveDownload } from "./googleDrive.js";
import { processPixeldrainDownload } from "./pixeldrain.js";
import { processKrakenFilesDownload } from "./krakenfiles.js";
import { processDatanodesDownload } from "./datanodes/index.js";
import { processDelafilDownload } from "./delafil.js";
import { processDownloadGg } from "./downloadgg.js";
import { processVik1ngfileDownload } from "./vik1ngfile.js";
import { processMediafireDownload } from "./mediafire.js";
import { processMixdropDownload } from "./mixdrop.js";
import { processUploadHavenDownload } from "./uploadhaven.js";
import { processUploadNowDownload } from "./uploadnow.js";
import { processWorkuploadDownload } from "./workupload.js";
import { processQuaxDownload } from "./quax.js";
import { processAkiraboxDownload } from "./akirabox.js";
export const HOST_PROCESSORS = [
  processBuzzheavierDownload,
  processGofileDownload,
  processGoogleDriveDownload,
  processPixeldrainDownload,
  processKrakenFilesDownload,
  processDatanodesDownload,
  processDelafilDownload,
  processDownloadGg,
  processVik1ngfileDownload,
  processMediafireDownload,
  processMixdropDownload,
  processUploadHavenDownload,
  processUploadNowDownload,
  processWorkuploadDownload,
  processQuaxDownload,
  processAkiraboxDownload,
];
export const DIRECT_DOWNLOAD_HOSTS = Object.freeze(
  HOST_PROCESSORS.map((processor) => processor.definition),
);

const DIRECT_DOWNLOAD_HOST_INDEX = new Map(
  DIRECT_DOWNLOAD_HOSTS.flatMap((host) => host.hostIncludes.map((hostname) => [hostname, host])),
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

export function getDirectDownloadHostAliases(id) {
  return DIRECT_DOWNLOAD_HOSTS.find((host) => host.id === String(id || ""))?.hostIncludes || [];
}

export function isExactDirectDownloadHost(id, hostname) {
  return getDirectDownloadHostAliases(id).includes(normalizeHostname(hostname));
}

export function isSupportedDirectDownloadHost(hostname) {
  return Boolean(findDirectDownloadHost(hostname));
}

export function createDirectDownloadPackageDefaults() {
  return Object.fromEntries(DIRECT_DOWNLOAD_HOSTS.map((host) => [host.id, true]));
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
