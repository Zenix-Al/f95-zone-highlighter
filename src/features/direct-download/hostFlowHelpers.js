import { saveConfigKeys } from "../../services/settingsService.js";
import { styleDownloadSuccess } from "../../utils/helpers.js";

export async function clearProcessingDownloadFlag() {
  await saveConfigKeys({ processingDownload: false });
}

export async function clearProcessingAndTryCloseTab() {
  await clearProcessingDownloadFlag();
  try {
    window.close();
  } catch (e) {
    console.warn("Close blocked (normal if tab not script-opened)", e);
    const msg = document.createElement("div");
    msg.innerHTML = `
      <div>
        Download started! You can close this tab now.
      </div>
    `;
    const el = msg.firstElementChild;
    styleDownloadSuccess(el, { background: "#ec5555", color: "white" });
    document.body.appendChild(el);
  }
}
