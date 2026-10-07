import { config } from "../../src/config.js";
import { loadConfig } from "../../src/services/settingsService.js";
import { publishStorageReadiness } from "../../src/services/storageReadiness.js";
import {
  disableNoticeDismissal,
  enableNoticeDismissal,
  forgetDismissedNotices,
} from "../../src/features/dismiss-notification/handler.js";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function renderNotices() {
  document.body.innerHTML = [11, 12]
    .map(
      (id) =>
        `<div class="js-notice" data-notice-id="${id}"><a class="js-noticeDismiss" href="#">x</a></div>`,
    )
    .join("");
}

function collapsedIds() {
  return [...document.querySelectorAll(".js-notice.f95-is-collapsing")].map((notice) =>
    Number(notice.getAttribute("data-notice-id")),
  );
}

export async function runNoticeDismissalScenario() {
  const loaded = await loadConfig();
  publishStorageReadiness({
    state: "ready",
    source: loaded.source,
    canRead: true,
    canWrite: true,
    canDelete: true,
  });
  config.savedNotifID = 5;

  renderNotices();
  enableNoticeDismissal();
  for (const dismiss of document.querySelectorAll(".js-noticeDismiss")) dismiss.click();
  for (let index = 0; index < 5; index += 1) await settle();
  const afterDismiss = [...config.dismissedNoticeIds];
  disableNoticeDismissal();

  renderNotices();
  enableNoticeDismissal();
  const collapsedOnReload = collapsedIds();

  const forgotten = await forgetDismissedNotices();
  const collapsedAfterForget = collapsedIds();
  disableNoticeDismissal();
  return {
    afterDismiss,
    collapsedOnReload,
    forgotten: forgotten.committed,
    afterForget: [...config.dismissedNoticeIds],
    savedNotifIDAfterForget: config.savedNotifID,
    collapsedAfterForget,
  };
}
