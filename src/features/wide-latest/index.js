import { createFeature } from "../../core/featureFactory.js";
import { latestPageScroll } from "../../utils/headerScrollHandler.js";

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

export const wideLatestPageFeature = createFeature("Wide Latest Page", {
    configPath: "latestSettings.wideLatest",
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

export const denseLatestGridFeature = createFeature("Dense Latest Grid", {
    configPath: "latestSettings.denseLatestGrid",
    enable: enableDenseLatestGrid,
    disable: disableDenseLatestGrid,
});
