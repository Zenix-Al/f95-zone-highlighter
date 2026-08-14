import { classifyDelafilPage } from "./delafil.js";
import { isDownloadGgFilePage } from "./downloadgg.js";
import { isKrakenFilesFilePage } from "./krakenfiles.js";
import { isPixeldrainFilePage } from "./pixeldrain.js";
import { isUploadHavenDownloadPage } from "./uploadhaven.js";
import { isBuzzheavierFilePage } from "./buzzheavier.js";
import { isGofileContentPage } from "./gofile.js";
import { isMediafireFilePage } from "./mediafire.js";
import { getWorkuploadStandaloneEntry } from "./workupload.js";
import { isGoogleDriveStandaloneEntryPage } from "./googleDrive.js";
import { isMixdropFilePage } from "./mixdrop.js";
import { isUploadNowSharePage } from "./uploadnow.js";
import {
  classifyDatanodesStandaloneEntry,
  isDatanodesStandaloneDownloadPage,
} from "./datanodes/index.js";
import {
  classifyVikingStandaloneContinuation,
  classifyVikingStandaloneEntry,
} from "./vik1ngfile.js";
import { getWorkuploadStandaloneContinuation } from "./workupload.js";

const STANDALONE_HOST_RULES = Object.freeze({
  "krakenfiles.com": { safeRoute: isKrakenFilesFilePage },
  "delafil.se": {
    safeRoute: (url) =>
      ["file", "tokenized"].includes(classifyDelafilPage(url)),
  },
  "download.gg": { safeRoute: isDownloadGgFilePage },
  "uploadhaven.com": { safeRoute: isUploadHavenDownloadPage },
  "pixeldrain.com": { safeRoute: isPixeldrainFilePage },
  "buzzheavier.com": { safeRoute: isBuzzheavierFilePage },
  "gofile.io": { safeRoute: isGofileContentPage },
  "mediafire.com": { safeRoute: isMediafireFilePage },
  "workupload.com": {
    entry: getWorkuploadStandaloneEntry,
    continuation: getWorkuploadStandaloneContinuation,
  },
  "drive.google.com": {
    safeRoute: isGoogleDriveStandaloneEntryPage,
    entry: describeGoogleDriveEntry,
    continuation: describeGoogleDriveContinuation,
  },
  "miiiixdrop.net": { safeRoute: isMixdropFilePage },
  "uploadnow.io": { safeRoute: isUploadNowSharePage },
  "datanodes.to": {
    safeRoute: isDatanodesStandaloneDownloadPage,
    entry: classifyDatanodesStandaloneEntry,
    continuation: describeDatanodesContinuation,
  },
  "vik1ngfile.site": {
    entry: classifyVikingStandaloneEntry,
    continuation: classifyVikingStandaloneContinuation,
  },
});

export function classifyStandaloneHostRoute(host, url = location.href) {
  const rule = STANDALONE_HOST_RULES[String(host || "")];
  if (!rule) {
    return { eligible: false, reason: "host_not_standalone_approved" };
  }
  try {
    return (rule.safeRoute?.(url) || rule.entry?.(url))
      ? { eligible: true, reason: "standalone_safe_route" }
      : { eligible: false, reason: "unsafe_or_unsupported_route" };
  } catch {
    return { eligible: false, reason: "unsafe_or_unsupported_route" };
  }
}

export function getStandaloneApprovedHosts() {
  return Object.freeze(Object.keys(STANDALONE_HOST_RULES));
}

export function describeStandaloneEntry(host, url = location.href) {
  try {
    return STANDALONE_HOST_RULES[String(host || "")]?.entry?.(url) || null;
  } catch {
    return null;
  }
}

export function describeStandaloneContinuation(host, url = location.href) {
  try {
    return (
      STANDALONE_HOST_RULES[String(host || "")]?.continuation?.(url) || null
    );
  } catch {
    return null;
  }
}

function describeGoogleDriveEntry(url) {
  if (!isGoogleDriveStandaloneEntryPage(url)) return null;
  try {
    const parsed = new URL(url, "https://drive.google.com/");
    const pathMatch = parsed.pathname.match(/^\/file\/d\/([^/]+)/i);
    const identity = pathMatch?.[1] || parsed.searchParams.get("id") || "";
    return identity
      ? {
          identity,
          nextStage: "drive-confirmation",
          consumeExisting:
            parsed.pathname === "/uc" ||
            parsed.hostname === "drive.usercontent.google.com",
        }
      : null;
  } catch {
    return null;
  }
}

function describeGoogleDriveContinuation(url) {
  try {
    const parsed = new URL(url, "https://drive.usercontent.google.com/");
    if (
      parsed.hostname !== "drive.usercontent.google.com" ||
      parsed.pathname !== "/download" ||
      parsed.searchParams.get("id")
    ) return null;
    return { identity: "", nextStage: "drive-confirmation" };
  } catch {
    return null;
  }
}

function describeDatanodesContinuation(url) {
  try {
    const parsed = new URL(url, "https://datanodes.to/");
    return parsed.hostname === "datanodes.to" && parsed.pathname.startsWith("/download")
      ? { identity: "", nextStage: "datanodes-download" }
      : null;
  } catch {
    return null;
  }
}
