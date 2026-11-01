import { findHostRoute } from "./shared/routes.js";
import { TIMINGS } from "./constants.js";
import { queryAllBySelectors, queryFirstBySelectors } from "../shared/utils.js";
import {
  clickElement,
  getAnchorHref,
  getElementText,
  isElementDisabled,
  isElementVisible,
  waitForCandidate,
} from "./shared/dom.js";

const HOST_LABEL = "drive.google.com";
const DRIVE_FILE_ID_PATTERN = /^[a-z0-9_-]+$/i;
const CONFIRMATION_FORM_SELECTORS = [
  "form#download-form",
  'form[action*="drive.usercontent.google.com/download"]',
  'form[action*="/download"]',
  'form[action*="/uc"]',
];
const CONFIRMATION_LINK_SELECTORS = ["a[href]"];

export function getGoogleDriveFileId(url = location.href) {
  try {
    const parsed = new URL(url, location.href);
    const pathMatch = parsed.pathname.match(/^\/file\/d\/([^/]+)/);
    return pathMatch?.[1] || parsed.searchParams.get("id") || "";
  } catch {
    return "";
  }
}

export function classifyGoogleDrivePage(url = location.href) {
  return findHostRoute(processGoogleDriveDownload.definition, url)?.kind || "unsupported";
}

export function buildGoogleDriveDownloadUrl(url = location.href) {
  const fileId = getGoogleDriveFileId(url);
  if (!fileId) return "";
  const target = new URL("https://drive.google.com/uc");
  target.searchParams.set("export", "download");
  target.searchParams.set("id", fileId);
  return target.href;
}

function isDriveConfirmationLink(anchor) {
  if (!(anchor instanceof HTMLAnchorElement)) return false;
  if (isElementDisabled(anchor) || !isElementVisible(anchor)) return false;
  const href = getAnchorHref(anchor);
  if (!href) return false;
  try {
    const parsed = new URL(href);
    const driveTarget =
      parsed.hostname === "drive.usercontent.google.com" ||
      (parsed.hostname === "drive.google.com" && parsed.pathname === "/uc");
    const text = getElementText(anchor);
    return driveTarget && (parsed.searchParams.has("confirm") || text.includes("download"));
  } catch {
    return false;
  }
}

function findDriveConfirmationAction() {
  const form = queryFirstBySelectors(CONFIRMATION_FORM_SELECTORS);
  if (form instanceof HTMLFormElement) return { kind: "form", element: form };
  const link = queryAllBySelectors(CONFIRMATION_LINK_SELECTORS).find(isDriveConfirmationLink);
  return link ? { kind: "link", element: link } : null;
}

function submitDriveForm(form) {
  const submitter = form.querySelector(
    'button[type="submit"]:not([disabled]), input[type="submit"]:not([disabled])',
  );
  try {
    form.requestSubmit(submitter || undefined);
    return true;
  } catch {
    return submitter ? clickElement(submitter) : false;
  }
}

export async function processGoogleDriveDownload({
  challengeGate,
  signal = challengeGate?.signal,
  notifyMainFailure,
  reportAddonHealthy,
}) {
  const pageKind = classifyGoogleDrivePage();
  if (pageKind === "preview") {
    if (challengeGate && !(await challengeGate.waitUntilClear())) return;
    const target = buildGoogleDriveDownloadUrl();
    if (!target) {
      await notifyMainFailure(HOST_LABEL, "Google Drive file ID not found.");
      return;
    }
    location.replace(target);
    return;
  }
  if (pageKind !== "confirmation") {
    await notifyMainFailure(HOST_LABEL, "Unsupported Google Drive page.");
    return;
  }

  if (challengeGate && !(await challengeGate.waitUntilClear())) return;
  const action = await waitForCandidate({
    signal,
    timeoutMs: 20000,
    intervalMs: Math.max(250, TIMINGS.POLL_INTERVAL),
    getCandidate: findDriveConfirmationAction,
  });
  if (!action) {
    await notifyMainFailure(HOST_LABEL, "Download confirmation not found.");
    return;
  }

  if (challengeGate && !(await challengeGate.waitUntilClear())) return;
  const triggered =
    action.element.isConnected &&
    findDriveConfirmationAction()?.element === action.element &&
    (action.kind === "form" ? submitDriveForm(action.element) : clickElement(action.element));
  if (!triggered) {
    await notifyMainFailure(HOST_LABEL, "Unable to confirm Google Drive download.");
    return;
  }
  reportAddonHealthy({ downloadTriggered: true });
}

processGoogleDriveDownload.definition = {
  id: "googleDrive",
  canonicalHost: "drive.google.com",
  hostIncludes: ["drive.google.com", "drive.usercontent.google.com"],
  text: "Google Drive",
  tooltip: "Enable direct download automation for Google Drive",
  routes: [
    {
      path: /^\/file\/d\/([a-z0-9_-]+)(?:\/(?:view|preview))?\/?$/i,
      hosts: ["drive.google.com"],
      kind: "preview",
      entry: { identity: 1, nextStage: "drive-confirmation", consumeExisting: false },
    },
    {
      path: /^\/open$/,
      hosts: ["drive.google.com"],
      query: { id: DRIVE_FILE_ID_PATTERN },
      kind: "preview",
      entry: { identity: { query: "id" }, nextStage: "drive-confirmation", consumeExisting: false },
    },
    {
      path: /^\/uc$/,
      hosts: ["drive.google.com"],
      query: { id: DRIVE_FILE_ID_PATTERN },
      kind: "confirmation",
      entry: { identity: { query: "id" }, nextStage: "drive-confirmation", consumeExisting: true },
    },
    {
      path: /^\/download$/,
      hosts: ["drive.usercontent.google.com"],
      query: { id: DRIVE_FILE_ID_PATTERN },
      kind: "confirmation",
      entry: { identity: { query: "id" }, nextStage: "drive-confirmation", consumeExisting: true },
    },
    {
      path: /^\/download$/,
      hosts: ["drive.usercontent.google.com"],
      emptyQuery: ["id"],
      kind: "confirmation",
      allow: false,
      continuation: { identity: "", nextStage: "drive-confirmation" },
    },
  ],

  mode: "custom",
  reason:
    "File-ID preview redirect and confirmation form/requestSubmit fallback across owned Google origins.",
};
