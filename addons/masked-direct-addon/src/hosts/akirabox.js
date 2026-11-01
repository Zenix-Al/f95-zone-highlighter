import { createHostAutomation } from "./shared/automation.js";
import { getAnchorHref, isElementDisabled, isElementVisible } from "./shared/dom.js";

function isDownloadLink(element) {
  try {
    const url = new URL(getAnchorHref(element));
    return (
      url.origin === "https://akirabox.com" &&
      !url.username &&
      !url.password &&
      /^\/download\/[^/]+\/[^/]+$/.test(url.pathname) &&
      isElementVisible(element) &&
      !isElementDisabled(element)
    );
  } catch {
    return false;
  }
}

export const processAkiraboxDownload = createHostAutomation({
  id: "akirabox",
  canonicalHost: "akirabox.to",
  hostIncludes: ["akirabox.to"],
  text: "Akirabox",
  tooltip: "Download Akirabox files after manual verification",
  routes: [{ path: /^\/[a-z0-9]{12}\/file\/?$/i }],
  actions: [
    {
      tool: "click",
      selectors: ["#download-button.download-file-link a#download.download-ready[href]"],
      validate: isDownloadLink,
      revalidate: (element, find) => find() === element,
      read: getAnchorHref,
      final: true,
      errors: {
        missing: "Akirabox download link not ready. Complete verification and continue manually.",
      },
    },
  ],
});
