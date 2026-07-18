import { isThreadPage } from "../thread/detector.js";

export function getLocalLibraryPageContext() {
  const isF95 = location.hostname.includes("f95zone.to");
  const threadPage = isThreadPage();
  return {
    pageScopes: threadPage ? ["f95zone", "thread"] : isF95 ? ["f95zone"] : [],
    pageType: threadPage ? "thread" : isF95 ? "f95zone" : "unknown",
    routeGeneration: 0,
    url: String(location.href || ""),
  };
}
