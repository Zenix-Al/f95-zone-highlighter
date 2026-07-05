import { createStyledFeature } from "../../core/createStyledFeature.js";
import { latestPageScroll } from "../../utils/headerScrollHandler.js";
import { createEnabledDisabledToast, createToggleSetting } from "../../ui/settings/metaFactory.js";
import featureCss from "./style.css";

const WIDE_LATEST_STYLE_ID = "feature-wide-latest";

// --- Wide Latest Page Feature ---
function enableWideLatestPage() {
  const root = document.documentElement;
  root.classList.add("latest-wide", "hide-notices", "header-scroll");
  latestPageScroll.enable();
}

function disableWideLatestPage() {
  const root = document.documentElement;
  root.classList.remove("latest-wide", "hide-notices", "header-scroll");
  latestPageScroll.disable();
}

export const wideLatestPageFeature = createStyledFeature("Wide Latest Page", {
  configPath: "latestSettings.wideLatest",
  pageScopes: ["isLatest"],
  isApplicable: ({ stateManager }) => stateManager.get("isLatest"),
  styleId: WIDE_LATEST_STYLE_ID,
  styleCss: featureCss,
  settingsUi: {
    id: "wide-latest-page",
    sectionId: "latest",
    metaMaps: [
      {
        wideLatest: createToggleSetting({
          text: "Wide Latest Page",
          tooltip: "Remove width limit on the Latest Updates page",
          config: "latestSettings.wideLatest",
          custom: () => {
            wideLatestPageFeature.sync();
          },
          toast: createEnabledDisabledToast("Wide Latest Page"),
        }),
      },
    ],
  },
  enable: enableWideLatestPage,
  disable: disableWideLatestPage,
});

// --- Dense Latest Grid Feature ---
function enableDenseLatestGrid() {
  document.documentElement.classList.add("latest-dense");
}

function disableDenseLatestGrid() {
  document.documentElement.classList.remove("latest-dense");
}

export const denseLatestGridFeature = createStyledFeature("Dense Latest Grid", {
  configPath: "latestSettings.denseLatestGrid",
  pageScopes: ["isLatest"],
  isApplicable: ({ stateManager }) => stateManager.get("isLatest"),
  styleId: WIDE_LATEST_STYLE_ID,
  styleCss: featureCss,
  settingsUi: {
    id: "dense-latest-grid",
    sectionId: "latest",
    metaMaps: [
      {
        denseLatestGrid: createToggleSetting({
          text: "Dense Latest Grid",
          tooltip: "Reduce spacing between thread tiles on the Latest Updates page",
          config: "latestSettings.denseLatestGrid",
          custom: () => {
            denseLatestGridFeature.sync();
          },
          toast: createEnabledDisabledToast("Dense Latest Grid"),
        }),
      },
    ],
  },
  enable: enableDenseLatestGrid,
  disable: disableDenseLatestGrid,
});
