import { createStyledFeature } from "../../core/createStyledFeature.js";
import { threadPageScroll } from "../../utils/headerScrollHandler.js";
import { SELECTORS } from "../../config/selectors.js";
import featureCss from "./style.css";
import { createEnabledDisabledToast } from "../../ui/settings/metaFactory.js";

function enableWideForum() {
  const root = document.documentElement;
  root.classList.add("wide-forum-enabled");
  document
    .querySelectorAll(SELECTORS.WIDE_FORUM.P_BODY_INNER)
    .forEach((el) => el.classList.add("no-max-width"));
  root.classList.add("thread-scroll-hide");
  threadPageScroll.enable();
}

function disableWideForum() {
  const root = document.documentElement;
  root.classList.remove("wide-forum-enabled");
  document
    .querySelectorAll(SELECTORS.WIDE_FORUM.P_BODY_INNER)
    .forEach((el) => el.classList.remove("no-max-width"));
  root.classList.remove("thread-scroll-hide");
  threadPageScroll.disable();
}

export const wideForumFeature = createStyledFeature("Wide Forum", {
  configPath: "threadSettings.isWide",
  isApplicable: ({ stateManager }) => stateManager.get("isThread"),
  styleCss: featureCss,
  enable: enableWideForum,
  disable: disableWideForum,
  settingsUi: {
    id: "wide-forum",
    sectionId: "thread",
    metaMaps: [
      {
        wideForumToggle: {
          type: "toggle",
          text: "Wide thread (full width)",
          tooltip: "Remove max-width restriction - makes thread use full screen width",
          config: "threadSettings.isWide",
          custom: () => wideForumFeature.toggle(wideForumFeature.isEnabled()),
          toast: createEnabledDisabledToast("Wide forum"),
        },
      },
    ],
  },
});
