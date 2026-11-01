import { isElementDisabled, isElementVisible } from "./shared/dom.js";
import { createHostAutomation } from "./shared/automation.js";
const DOWNLOAD_PATH_PATTERN = /^\/download\/[^/]+\/?$/i;
const RECENT_RUN_TTL_MS = 30000;
export const UPLOADHAVEN_POST_CLICK_GRACE_MS = 10000;

function findReadyFreeDownloadButton() {
  const button = document.querySelector("button#submitFree.uh-dl-btn-free.ready");
  if (!(button instanceof HTMLButtonElement)) return null;
  if (isElementDisabled(button) || !isElementVisible(button)) return null;
  return button;
}

export const processUploadHavenDownload = createHostAutomation({
  id: "uploadhaven",
  canonicalHost: "uploadhaven.com",
  hostIncludes: ["uploadhaven.com", "www.uploadhaven.com"],
  text: "UploadHaven",
  tooltip: "Enable direct download automation for uploadhaven.com",
  routes: [{ path: DOWNLOAD_PATH_PATTERN }],
  routeError: "Unsupported UploadHaven page.",
  recent: {
    key: () => `f95ue-uploadhaven-download:${location.pathname}`,
    ttlMs: RECENT_RUN_TTL_MS,
  },
  actions: [
    { tool: "delay", ms: (o) => o.initialWaitMs ?? 20000 },
    {
      tool: "click",
      select: findReadyFreeDownloadButton,
      revalidate: (element, find) => find() === element,
      timeoutMs: 60000,
      prepare: ["scroll", "focus"],
      final: true,
      graceMs: (o) => o.postClickGraceMs ?? UPLOADHAVEN_POST_CLICK_GRACE_MS,
      errors: {
        missing: "Free Download button did not become ready.",
        changed: "Download button changed before dispatch.",
        click: "Unable to trigger the Free Download button.",
      },
    },
  ],
});
