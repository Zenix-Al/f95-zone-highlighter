import { processBuzzheavierDownload } from "./buzzheavier.js";
import { processDatanodesDownload } from "./datanodes.js";
import { processGofileDownload } from "./gofile.js";
import { processMediafireDownload } from "./mediafire.js";
import { processPixeldrainDownload } from "./pixeldrain.js";
import { processWorkuploadDownload } from "./workupload.js";

export function createDirectDownloadHostHandlers({
  debugLog,
  showToast,
  notifyMainFailure,
  reportAddonHealthy,
  stageStore,
  getSettings,
  getDownloadCloseDelay,
}) {
  const common = {
    showToast,
    notifyMainFailure,
    reportAddonHealthy,
    getDownloadCloseDelay,
  };

  return {
    "buzzheavier.com": () => processBuzzheavierDownload(common),
    "pixeldrain.com": () =>
      processPixeldrainDownload({
        ...common,
        debugLog,
      }),
    "gofile.io": () => processGofileDownload(common),
    "datanodes.to": () =>
      processDatanodesDownload({
        ...common,
        stageStore,
        settings: typeof getSettings === "function" ? getSettings() : {},
      }),
    "mediafire.com": () => processMediafireDownload(common),
    "workupload.com": () => processWorkuploadDownload(common),
  };
}
