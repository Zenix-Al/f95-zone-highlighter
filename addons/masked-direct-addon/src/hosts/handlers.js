import { processBuzzheavierDownload } from "./buzzheavier.js";
import { processDatanodesDownload } from "./datanodes/index.js";
import { processDelafilDownload } from "./delafil.js";
import { processDownloadGg } from "./downloadgg.js";
import { processGofileDownload } from "./gofile.js";
import { processGoogleDriveDownload } from "./googleDrive.js";
import { processKrakenFilesDownload } from "./krakenfiles.js";
import { processMediafireDownload } from "./mediafire.js";
import { processMixdropDownload } from "./mixdrop.js";
import { processPixeldrainDownload } from "./pixeldrain.js";
import { processUploadHavenDownload } from "./uploadhaven.js";
import { processUploadNowDownload } from "./uploadnow.js";
import { processVik1ngfileDownload } from "./vik1ngfile.js";
import { processWorkuploadDownload } from "./workupload.js";

export function createDirectDownloadHostHandlers({
  debugLog,
  notifyMainFailure,
  reportAddonHealthy,
  getSettings,
  getDownloadCloseDelay,
}) {
  const common = (challengeGate) => ({
    challengeGate,
    notifyMainFailure,
    reportAddonHealthy,
    getDownloadCloseDelay,
  });

  return {
    "buzzheavier.com": (gate) => processBuzzheavierDownload(common(gate)),
    "pixeldrain.com": (gate) =>
      processPixeldrainDownload({
        ...common(gate),
        debugLog,
      }),
    "gofile.io": (gate) => processGofileDownload(common(gate)),
    "drive.google.com": (gate) => processGoogleDriveDownload(common(gate)),
    "krakenfiles.com": (gate) => processKrakenFilesDownload(common(gate)),
    "datanodes.to": (gate) =>
      processDatanodesDownload({
        ...common(gate),
        settings: typeof getSettings === "function" ? getSettings() : {},
      }),
    "delafil.se": (gate) => processDelafilDownload(common(gate)),
    "download.gg": (gate) => processDownloadGg(common(gate)),
    "vik1ngfile.site": (gate) =>
      processVik1ngfileDownload({
        ...common(gate),
      }),
    "mediafire.com": (gate) => processMediafireDownload(common(gate)),
    "miiiixdrop.net": (gate) => processMixdropDownload(common(gate)),
    "uploadhaven.com": (gate) => processUploadHavenDownload(common(gate)),
    "uploadnow.io": (gate) => processUploadNowDownload(common(gate)),
    "workupload.com": (gate) => processWorkuploadDownload(common(gate)),
  };
}
