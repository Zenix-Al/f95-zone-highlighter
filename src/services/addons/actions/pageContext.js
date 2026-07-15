import { stateManager } from "../../../config.js";
import { getRouteContext } from "../../../core/routeState.js";

const MAX_TEXT_LENGTH = 240;
const MAX_IMAGE_URL_LENGTH = 512;
const THREAD_ID_PATTERN = /(?:\/threads\/|\.)([0-9]+)(?:\/|$)/i;

function boundedText(value, maxLength = MAX_TEXT_LENGTH) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function getThreadId(pathname) {
  return String(pathname || "").match(THREAD_ID_PATTERN)?.[1] || "";
}

function getThreadTitle() {
  const titleNode = typeof document !== "undefined"
    ? document.querySelector("h1.p-title-value")
    : null;
  const title = boundedText(titleNode?.textContent || "");
  if (title) return title;
  return boundedText(typeof document !== "undefined" ? document.title : "");
}

function getThreadImage() {
  if (typeof document === "undefined") return "";
  const meta = document.querySelector('meta[property="og:image"]');
  const value = String(meta?.getAttribute?.("content") || "").trim();
  return value.slice(0, MAX_IMAGE_URL_LENGTH);
}

function normalizePageContext() {
  const route = getRouteContext();
  let parsed = null;
  try {
    parsed = new URL(route.url || (typeof location !== "undefined" ? location.href : ""));
  } catch {
    parsed = null;
  }

  const pageFlags = route.pageFlags && typeof route.pageFlags === "object"
    ? route.pageFlags
    : {};
  const pageScopes = [
    ["f95zone", "isF95Zone"],
    ["thread", "isThread"],
    ["latest", "isLatest"],
  ].filter(([, key]) => pageFlags[key] === true || stateManager.get(key) === true)
    .map(([scope]) => scope);

  return {
    hostname: boundedText(parsed?.hostname || (typeof location !== "undefined" ? location.hostname : ""), 120),
    pathname: boundedText(parsed?.pathname || (typeof location !== "undefined" ? location.pathname : ""), 512),
    search: boundedText(parsed?.search || "", 512),
    hash: boundedText(parsed?.hash || "", 512),
    url: boundedText(route.url || parsed?.href || "", 1024),
    pageScopes,
    pageType: pageScopes.includes("latest")
      ? "latest"
      : pageScopes.includes("thread")
        ? "thread"
        : pageScopes.includes("f95zone")
          ? "f95zone"
          : "unknown",
    routeGeneration: Math.max(0, Number(route.generation) || 0),
    threadId: getThreadId(parsed?.pathname || ""),
    threadTitle: pageScopes.includes("thread") ? getThreadTitle() : "",
    threadImageUrl: pageScopes.includes("thread") ? getThreadImage() : "",
  };
}

export function validatePageContextPayload(payload) {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? true
    : { ok: false, reason: "invalid_payload" };
}

export function validatePageContextResult(result) {
  const value = result?.value;
  if (!result?.ok || !value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, reason: "invalid_action_result" };
  }
  const stringLimits = {
    hostname: 120,
    pathname: 512,
    search: 512,
    hash: 512,
    url: 1024,
    threadId: 64,
    threadTitle: MAX_TEXT_LENGTH,
    threadImageUrl: MAX_IMAGE_URL_LENGTH,
  };
  if (!Object.entries(stringLimits).every(([key, limit]) => typeof value[key] === "string" && value[key].length <= limit)) {
    return { ok: false, reason: "invalid_action_result" };
  }
  if (!Array.isArray(value.pageScopes) || value.pageScopes.length > 3
    || value.pageScopes.some((scope) => !["f95zone", "thread", "latest"].includes(scope))) {
    return { ok: false, reason: "invalid_action_result" };
  }
  if (!["f95zone", "thread", "latest", "unknown"].includes(value.pageType)
    || !Number.isInteger(value.routeGeneration) || value.routeGeneration < 0) {
    return { ok: false, reason: "invalid_action_result" };
  }
  return true;
}

export function actionPageGetContext() {
  return { ok: true, value: normalizePageContext() };
}
