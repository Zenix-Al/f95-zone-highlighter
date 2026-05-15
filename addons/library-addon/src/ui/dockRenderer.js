import dockHtmlTemplate from "./dock.html";

function buildPrimaryButtonMarkup({ showPrimaryButton, isSaved }) {
  if (!showPrimaryButton) return "";
  const classes = ["f95ue-page-dock-btn"];
  if (isSaved) classes.push("saved");
  return `<button type="button" class="${classes.join(" ")}" data-action="toggle-thread">${isSaved ? "Remove from Library" : "Save to Library"}</button>`;
}

function buildUpdateButtonMarkup({ showPrimaryButton, isSaved }) {
  if (!showPrimaryButton || !isSaved) return "";
  return `<button type="button" class="f95ue-page-dock-btn secondary" data-action="update-thread" title="Update from this thread">Update</button>`;
}

export function renderDockMarkup({ showPrimaryButton, isSaved }) {
  return dockHtmlTemplate
    .replace("__PRIMARY_BUTTON__", buildPrimaryButtonMarkup({ showPrimaryButton, isSaved }))
    .replace("__UPDATE_BUTTON__", buildUpdateButtonMarkup({ showPrimaryButton, isSaved }));
}
