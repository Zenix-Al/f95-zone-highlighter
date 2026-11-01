import { TIMINGS } from "../constants.js";
import { createHostAutomation } from "../shared/automation.js";
import { findBestAction } from "../shared/repeat.js";
const DATANODES_ENTRY_PATH = /^\/([a-z0-9_-]{8,64})\/([^/]+)\/?$/i;

function isControlVisible(element) {
  if (!element || !element.isConnected) return false;
  try {
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    const rect = element.getBoundingClientRect?.();
    if (rect && rect.width <= 0 && rect.height <= 0) return false;
  } catch {
    // fall through to ready check
  }
  return true;
}

export const datanodesAutomation = {
  id: "datanodes",
  canonicalHost: "datanodes.to",
  hostIncludes: ["datanodes.to"],
  text: "Datanodes",
  tooltip: "Enable direct download automation for datanodes.to",
  routes: [
    {
      path: DATANODES_ENTRY_PATH,
      entry: {
        nextStage: "datanodes-download",
        identity: (_url, match) => {
          if (["download", "downloads"].includes(match[1].toLowerCase())) return null;
          const title = decodeURIComponent(match[2]).trim();
          return title ? match[1] + ":" + title : null;
        },
      },
    },
    { path: /^\/download$/, kind: "file" },
    {
      path: /^\/download/,
      allow: false,
      continuation: { identity: "", nextStage: "datanodes-download" },
    },
  ],
  mode: "repeat",
  settingsKey: "datanodes",
  selector: "a, button, input",
  timeoutMs: TIMINGS.DATANODES_TOTAL_FLOW_TIMEOUT,
  intervalMs: TIMINGS.DATANODES_POLL_INTERVAL,
  frameBudgetMs: 5,
  cooldownMs: 900,
  finalMarker: "data-f95ue-datanodes-clicked",
  timeoutMessage: "Datanodes automation timed out. Please continue manually.",
  visible: isControlVisible,
  exclude: (text) => !text || text.includes("premium"),
  actions: [
    {
      id: "continue",
      tool: "click",
      priority: 1,
      match: (text) => text.includes("continue to download") || text === "continue",
    },
    {
      id: "free_download",
      tool: "click",
      priority: 2,
      match: (text) => text.includes("free download"),
    },
    {
      id: "final_download",
      tool: "click",
      priority: 3,
      final: true,
      match: (text) =>
        (text.includes("start download") ||
          text.includes("download now") ||
          (text.includes("download") && !text.includes("free"))) &&
        !/wait|preparing|processing|\b\d+\s*s\b/.test(text),
    },
  ],
};
export const findBestDatanodesAction = (options) => findBestAction(datanodesAutomation, options);
export const processDatanodesDownload = createHostAutomation(datanodesAutomation);
