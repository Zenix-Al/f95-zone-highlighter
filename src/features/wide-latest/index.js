import { createStyledFeature } from "../../core/createStyledFeature.js";
import { latestPageScroll } from "../../utils/headerScrollHandler.js";
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
  styleId: WIDE_LATEST_STYLE_ID,
  styleCss: featureCss,
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
  styleId: WIDE_LATEST_STYLE_ID,
  styleCss: featureCss,
  enable: enableDenseLatestGrid,
  disable: disableDenseLatestGrid,
});
