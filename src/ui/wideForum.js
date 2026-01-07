import { config, state } from "../constants";

export function wideForum() {
  if (!state.isThread) return;

  const isWide = !!config.threadSettings.isWide;
  const root = document.documentElement;

  document
    .querySelectorAll(".p-body-inner")
    .forEach((el) => el.classList.toggle("no-max-width", isWide));

  if (isWide) {
    root.classList.add("thread-scroll-hide");
    enableThreadHeaderScroll();
  } else {
    root.classList.remove("thread-scroll-hide");
    disableThreadHeaderScroll();
  }
}

let threadScrollHandler = null;

export function enableThreadHeaderScroll() {
  if (threadScrollHandler) return;

  let lastScrollY = window.scrollY;

  threadScrollHandler = () => {
    const root = document.documentElement;
    const currentY = window.scrollY;

    if (currentY > lastScrollY && currentY > 120) {
      root.classList.add("thread-header-hidden");
    } else {
      root.classList.remove("thread-header-hidden");
    }

    lastScrollY = currentY;
  };

  window.addEventListener("scroll", threadScrollHandler, { passive: true });
}

export function disableThreadHeaderScroll() {
  if (!threadScrollHandler) return;

  window.removeEventListener("scroll", threadScrollHandler);
  threadScrollHandler = null;

  document.documentElement.classList.remove("thread-header-hidden");
}
