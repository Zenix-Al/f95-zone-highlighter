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
  createHostExecutionContext,
  getSettings,
  getDownloadCloseDelay,
}) {
  const run = (processor, challengeGate, decision, execution, extra = {}) => {
    const context = execution || createHostExecutionContext(decision);
    return processor({
      challengeGate,
      notifyMainFailure: context.notifyMainFailure,
      reportAddonHealthy: context.reportAddonHealthy,
      getDownloadCloseDelay,
      ...extra,
    });
  };

  return {
    "buzzheavier.com": (gate, decision, execution) =>
      run(processBuzzheavierDownload, gate, decision, execution),
    "pixeldrain.com": (gate, decision, execution) =>
      run(processPixeldrainDownload, gate, decision, execution, { debugLog }),
    "gofile.io": (gate, decision, execution) =>
      run(processGofileDownload, gate, decision, execution),
    "drive.google.com": (gate, decision, execution) =>
      run(processGoogleDriveDownload, gate, decision, execution),
    "krakenfiles.com": (gate, decision, execution) =>
      run(processKrakenFilesDownload, gate, decision, execution),
    "datanodes.to": (gate, decision, execution) =>
      run(processDatanodesDownload, gate, decision, execution, {
        settings: typeof getSettings === "function" ? getSettings() : {},
      }),
    "delafil.se": (gate, decision, execution) =>
      run(processDelafilDownload, gate, decision, execution),
    "download.gg": (gate, decision, execution) =>
      run(processDownloadGg, gate, decision, execution),
    "vik1ngfile.site": (gate, decision, execution) =>
      run(processVik1ngfileDownload, gate, decision, execution),
    "mediafire.com": (gate, decision, execution) =>
      run(processMediafireDownload, gate, decision, execution),
    "miiiixdrop.net": (gate, decision, execution) =>
      run(processMixdropDownload, gate, decision, execution),
    "uploadhaven.com": (gate, decision, execution) =>
      run(processUploadHavenDownload, gate, decision, execution),
    "uploadnow.io": (gate, decision, execution) =>
      run(processUploadNowDownload, gate, decision, execution),
    "workupload.com": (gate, decision, execution) =>
      run(processWorkuploadDownload, gate, decision, execution),
  };
}
