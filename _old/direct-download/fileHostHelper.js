import { config, downloadHostConfigs } from "../../config";
import { SELECTORS } from "../../config/selectors.js";
import { queryFirstBySelectors } from "../../utils/selectorQuery.js";
import { processGofileDownload } from "./gofile.js";
import { processPixeldrainDownload } from "./pixeldrain.js";
import { processDatanodesDownload } from "./datanodes.js";
import { getDirectDownloadHostContext } from "./hostPackages.js";

const hostHandlers = {
  "buzzheavier.com": handleBuzzshare,
  "gofile.io": processGofileDownload,
  "pixeldrain.com": processPixeldrainDownload,
  "datanodes.to": processDatanodesDownload,
};

// this file is for iframe download handlers or common handler
// if a site require normal user like behavior or complex interaction
// single site helper should be used instead to avoid bloating this file
export function handleDownload(host) {
  if (config.threadSettings.directDownloadLinks === false) return;
  if (!getDirectDownloadHostContext(host, { requireEnabled: true })) return;

  const handler = hostHandlers[host];
  if (!handler) return;

  const exec = async () => {
    // Handlers are now self-sufficient and get their own config
    await handler();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", exec);
  } else {
    exec();
  }
}
async function handleBuzzshare() {
  if (window.top === window.self) return; // This handler should only run in an iframe
  const { btn: btnEl, directDownloadLink: dlLink } =
    downloadHostConfigs["buzzheavier.com"].handlerConfig;
  const selectorCandidates = [btnEl, ...SELECTORS.BUZZHEAVIER.DOWNLOAD_BUTTON_CANDIDATES];

  function failedDownload() {
    window.parent.postMessage(
      {
        op: "FAILED",
        src: window.location.href,
        dest: null,
      },
      "*",
    );
  }
  const btn = queryFirstBySelectors(selectorCandidates);
  if (!btn) {
    failedDownload();
    return;
  }

  const endpointSource =
    btn.getAttribute("hx-get") || btn.getAttribute("data-hx-get") || btn.getAttribute("href");
  if (!endpointSource) {
    failedDownload();
    return;
  }

  let endpoint = "";
  try {
    endpoint = new URL(endpointSource, window.location.origin).href;
  } catch {
    failedDownload();
    return;
  }

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
          op: "DOWNLOAD_LINK_RESOLVED",
          src: window.location.href,
          dest: dest.replace(/&amp;/g, "&"),
        },
        "*",
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
