import { latestPageScroll } from "../../utils/headerScrollHandler";
import { config } from "../../config";
export function toggleWideLatestPage() {
  const root = document.documentElement;
  const isWide = !!config.latestSettings.wideLatest;

  root.classList.toggle("latest-wide", isWide);
  root.classList.toggle("hide-notices", isWide);
  root.classList.toggle("header-scroll", isWide);

  if (isWide) {
    latestPageScroll.enable();
  } else {
    latestPageScroll.disable();
  }
}
