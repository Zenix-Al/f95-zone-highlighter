import { createHostAutomation } from "./shared/automation.js";
import { getAnchorHref, isElementDisabled, isElementVisible } from "./shared/dom.js";

function isDownloadUrl(url) {
  const id = location.pathname.split("/")[1];
  return (
    url.origin === "https://qu.ax" &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    /^\/x\/[a-z0-9]{5}(?:\.[a-z0-9_-]+)+$/i.test(url.pathname) &&
    url.pathname.startsWith(`/x/${id}.`)
  );
}

function inspectDownload() {
  const links = [...document.querySelectorAll("a[download][href]")].filter((link) => {
    try {
      return (
        isDownloadUrl(new URL(getAnchorHref(link))) &&
        isElementVisible(link) &&
        !isElementDisabled(link)
      );
    } catch {
      return false;
    }
  });
  return links.length > 1
    ? { status: "unsafe" }
    : links.length === 1
      ? { status: "ready", element: links[0] }
      : { status: "loading" };
}

export const processQuaxDownload = createHostAutomation({
  id: "quax",
  canonicalHost: "qu.ax",
  hostIncludes: ["qu.ax"],
  text: "qu.ax",
  tooltip: "Enable native qu.ax file downloads",
  routes: [{ path: /^\/[a-z0-9]{5}\/?$/i }],
  actions: [
    {
      tool: "click",
      inspect: inspectDownload,
      read: getAnchorHref,
      final: true,
      errors: { missing: "qu.ax download link not found." },
    },
  ],
});
