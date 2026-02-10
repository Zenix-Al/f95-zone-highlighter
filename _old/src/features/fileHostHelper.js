import { config, supportedDirectDownload } from "../constants";

// this file is for iframe download handlers or common handler
// if a site require normal user like behavior or complex interaction
// single site helper should be used instead to avoid bloating this file
export function handleDownload(host) {
  if (window.top === window.self) return; // only run in iframe
  if (config.threadSettings.directDownloadLinks === false) return;
  const hostInfo = supportedDirectDownload.find((h) => h.id === host);
  if (!hostInfo) return;
  const btnEl = hostInfo.btn;
  const dlLink = hostInfo.directDownloadLink;
  let exec = () => {};
  if (host === "buzzheavier.com") {
    exec = async () => {
      await handleBuzzshare(btnEl, dlLink);
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", exec);
  } else {
    exec();
  }
}
async function handleBuzzshare(btnEl, dlLink) {
  function failedDownload() {
    window.parent.postMessage(
      {
        op: "FAILED",
        src: window.location.href,
        dest: null,
      },
      "*"
    );
  }
  const btn = document.querySelector(btnEl);
  if (!btn) {
    failedDownload();
    return;
  }

  const endpoint = window.location.origin + btn.getAttribute("hx-get");

  try {
    const res = await fetch(endpoint, {
      headers: {
        "HX-Request": "true",
        "HX-Current-URL": window.location.href,
      },
    });

    const text = await res.text();
    const match = text.match(dlLink);
    const header = res.headers.get("HX-Redirect");

    let dest = match ? match[0] : header && header.includes("trashbytes.net") ? header : null;
    if (!dest && res.url.includes("trashbytes.net")) dest = res.url;

    if (dest) {
      window.parent.postMessage(
        {
          op: "BH_RESOLVED",
          src: window.location.href,
          dest: dest.replace(/&amp;/g, "&"),
        },
        "*"
      );
    }
    if (document.body.innerText.includes("This file could not be found.")) {
      failedDownload();
      return;
    }
  } catch (e) {
    console.error("[BH-Resolver] Fetch failed", e);
  }
}

/* === feature deprecated ===
function handlePixeldrain() {
  debugLog("handlePixeldrain", "Handling pixeldrain download");
  setTimeout(() => {
    window.parent.postMessage(
      {
        op: "BH_RESOLVED",
        src: window.location.href,
        dest: null,
      },
      "*"
    );
  }, 10000);
  const buttons = document.querySelectorAll("button.button_highlight");

  const downloadBtn = [...buttons].find((btn) =>
    btn.textContent.toLowerCase().includes("download")
  );

  if (!downloadBtn) {
    debugLog("handlePixeldrain", "Download button not found");
    return;
  }

  downloadBtn.click();
}

async function handlePixeldrain() {
  debugLog("handlePixeldrain", "Handling pixeldrain download");
  setTimeout(() => {
    window.parent.postMessage(
      {
        op: "BH_RESOLVED",
        src: window.location.href,
        dest: null,
      },
      "*"
    );
  }, 10000);
  try {
    const url = window.location.href;
    const match = url.match(/pixeldrain\.com\/u\/([A-Za-z0-9]+)/);
    if (!match) {
      window.open(url, "_blank");
      throw new Error("Invalid Pixeldrain URL");
    }

    const fileId = match[1];
    const directUrl = `https://pixeldrain.com/api/file/${fileId}?download`;
    const res = await fetch(directUrl, {
      headers: {
        "HX-Request": "true",
        "HX-Current-URL": window.location.href,
      },
    });
    const text = await res.text();
    debugLog("handlePixeldrain", "Fetched direct download URL:", text);
    showToast("Direct download initiated.");
  } catch (err) {
    showToast("Failed to start download.");
    window.open(window.location.href, "_blank");
  }
}
*/
