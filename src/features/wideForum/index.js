import { createFeature } from "../../core/featureFactory.js";
import { threadPageScroll } from "../../utils/headerScrollHandler.js";

function enableWideForum() {
  const root = document.documentElement;
  document
    .querySelectorAll(".p-body-inner")
    .forEach((el) => el.classList.add("no-max-width"));
  root.classList.add("thread-scroll-hide");
  threadPageScroll.enable();
}

function disableWideForum() {
  const root = document.documentElement;
  document
    .querySelectorAll(".p-body-inner")
    .forEach((el) => el.classList.remove("no-max-width"));
  root.classList.remove("thread-scroll-hide");
  threadPageScroll.disable();
}

export const wideForumFeature = createFeature("Wide Forum", {
  configPath: "threadSettings.isWide",
  enable: enableWideForum,
  disable: disableWideForum,
});
