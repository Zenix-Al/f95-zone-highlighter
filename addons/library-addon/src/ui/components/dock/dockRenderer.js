import dockHtmlTemplate from "../../assets/dock.html";
import { UPDATE_ACTIVITY_LABELS } from "../../../library/autoUpdateActivity.js";

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

export function renderDockMarkup({ showPrimaryButton, isSaved, activity = "idle" }) {
  if (!Object.hasOwn(UPDATE_ACTIVITY_LABELS, activity)) activity = "idle";
  return dockHtmlTemplate
    .replace("__ACTIVITY__", activity)
    .replace("__ACTIVITY_LABEL__", UPDATE_ACTIVITY_LABELS[activity])
    .replace("__PRIMARY_BUTTON__", buildPrimaryButtonMarkup({ showPrimaryButton, isSaved }))
    .replace("__UPDATE_BUTTON__", buildUpdateButtonMarkup({ showPrimaryButton, isSaved }));
}
