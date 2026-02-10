import { config, state } from "../../config";
import { threadPageScroll } from "../../utils/headerScrollHandler";

export function wideForum() {
  if (!state.isThread) return;

  const isWide = !!config.threadSettings.isWide;
  const root = document.documentElement;

  document
    .querySelectorAll(".p-body-inner")
    .forEach((el) => el.classList.toggle("no-max-width", isWide));

  root.classList.toggle("thread-scroll-hide", isWide);

  if (isWide) {
    threadPageScroll.enable();
  } else {
    threadPageScroll.disable();
  }
}
