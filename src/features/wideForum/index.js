import { createFeature } from "../../core/featureFactory.js";
import { threadPageScroll } from "../../utils/headerScrollHandler.js";
import { SELECTORS } from "../../config/selectors.js";
import featureCss from "./style.css";
import { acquireStyle, removeStyle } from "../../core/styleRegistry.js";

const WIDE_FORUM_STYLE_ID = "feature-wide-forum";

function enableWideForum() {
  acquireStyle(WIDE_FORUM_STYLE_ID, featureCss, "document");
  const root = document.documentElement;
  document
    .querySelectorAll(SELECTORS.WIDE_FORUM.P_BODY_INNER)
    .forEach((el) => el.classList.add("no-max-width"));
  root.classList.add("thread-scroll-hide");
  threadPageScroll.enable();
}

function disableWideForum() {
  const root = document.documentElement;
  document
    .querySelectorAll(SELECTORS.WIDE_FORUM.P_BODY_INNER)
    .forEach((el) => el.classList.remove("no-max-width"));
  root.classList.remove("thread-scroll-hide");
  threadPageScroll.disable();
  removeStyle(WIDE_FORUM_STYLE_ID);
}

export const wideForumFeature = createFeature("Wide Forum", {
  configPath: "threadSettings.isWide",
  enable: enableWideForum,
  disable: disableWideForum,
});
