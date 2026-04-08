import dockHtmlTemplate from "./dock.html";

function buildPrimaryButtonMarkup({ showPrimaryButton, isSaved }) {
  if (!showPrimaryButton) return "";
  const classes = ["f95ue-page-dock-btn"];
  if (isSaved) classes.push("saved");
  return `<button type="button" class="${classes.join(" ")}" data-action="toggle-thread">${isSaved ? "Remove from Library" : "Save to Library"}</button>`;
}

export function renderDockMarkup({ showPrimaryButton, isSaved }) {
  return dockHtmlTemplate.replace(
    "__PRIMARY_BUTTON__",
    buildPrimaryButtonMarkup({ showPrimaryButton, isSaved }),
  );
}
