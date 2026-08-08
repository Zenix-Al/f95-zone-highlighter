import { classifyDelafilPage } from "./delafil.js";
import { isDownloadGgFilePage } from "./downloadgg.js";
import { isKrakenFilesFilePage } from "./krakenfiles.js";
import { isPixeldrainFilePage } from "./pixeldrain.js";
import { isUploadHavenDownloadPage } from "./uploadhaven.js";

const STANDALONE_ROUTE_CHECKS = Object.freeze({
  "krakenfiles.com": isKrakenFilesFilePage,
  "delafil.se": (url) =>
    ["file", "tokenized"].includes(classifyDelafilPage(url)),
  "download.gg": isDownloadGgFilePage,
  "uploadhaven.com": isUploadHavenDownloadPage,
  "pixeldrain.com": isPixeldrainFilePage,
});

export function classifyStandaloneHostRoute(host, url = location.href) {
  const check = STANDALONE_ROUTE_CHECKS[String(host || "")];
  if (typeof check !== "function") {
    return { eligible: false, reason: "host_not_standalone_approved" };
  }
  try {
    return check(url)
      ? { eligible: true, reason: "standalone_safe_route" }
      : { eligible: false, reason: "unsafe_or_unsupported_route" };
  } catch {
    return { eligible: false, reason: "unsafe_or_unsupported_route" };
  }
}

export function getStandaloneApprovedHosts() {
  return Object.freeze(Object.keys(STANDALONE_ROUTE_CHECKS));
}
