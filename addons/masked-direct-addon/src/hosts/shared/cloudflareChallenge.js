import { sleep } from "../../shared/utils.js";

const CHALLENGE_SELECTORS = [
  "#challenge-running",
  "#challenge-stage",
  "#cf-chl-widget",
  'iframe[src*="challenges.cloudflare.com"]',
];

const DEFAULT_POLL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const MUTATION_DEBOUNCE_MS = 100;

export function isCloudflareChallengePage(
  root = document,
  readText = () => root.body?.textContent,
) {
  try {
    const turnstileResponse = root.querySelector?.(
      'input[name="cf-turnstile-response"], textarea[name="cf-turnstile-response"]',
    );
    if (String(turnstileResponse?.value || "").trim()) {
      return false;
    }
    if (
      root.querySelector?.(".cf-turnstile") ||
      turnstileResponse ||
      CHALLENGE_SELECTORS.some((selector) => root.querySelector?.(selector))
    ) {
      return true;
    }
    const title = String(root.title || "")
      .trim()
      .toLowerCase();
    if (title === "just a moment..." || title === "attention required!") {
      return true;
    }
    const text = String(readText() || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    return (
      text.includes("verify you are human") ||
      text.includes("performing security verification") ||
      text.includes("checking if the site connection is secure")
    );
  } catch {
    return false;
  }
}

export function createCloudflareChallengeMonitor({
  debugLog,
  host,
  notifyChallenge,
  pollMs = DEFAULT_POLL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  let active = false;
  let disposed = false;
  let episodeNotified = false;
  let mutationTimer = null;
  let pollTimer = null;
  let observer = null;
  let waitPromise = null;
  const cancellation = new AbortController();
  let textDirty = true,
    textBody = null,
    textValue = "",
    textReadAt = -Infinity;
  const invalidateText = (records) => {
    if (records.some((record) => record.type === "childList" || record.type === "characterData"))
      textDirty = true;
  };
  const readText = () => {
    if (textDirty || textBody !== document.body || Date.now() - textReadAt >= pollMs) {
      textBody = document.body;
      textValue = textBody?.textContent || "";
      textReadAt = Date.now();
      textDirty = false;
    }
    return textValue;
  };

  const check = () => {
    if (disposed) return false;
    if (observer) invalidateText(observer.takeRecords());
    const next = isCloudflareChallengePage(document, readText);
    if (next && !active) {
      active = true;
      episodeNotified = false;
      debugLog?.("DownloadHooks", "Cloudflare challenge detected.", { host });
    } else if (!next && active) {
      active = false;
      episodeNotified = false;
      debugLog?.("DownloadHooks", "Cloudflare challenge cleared.", { host });
    }
    return active;
  };

  const scheduleCheck = (records) => {
    invalidateText(records);
    if (disposed || mutationTimer !== null) return;
    mutationTimer = setTimeout(() => {
      mutationTimer = null;
      check();
    }, MUTATION_DEBOUNCE_MS);
  };

  function start() {
    if (disposed || observer) return;
    check();
    observer = new MutationObserver(scheduleCheck);
    observer.observe(document.documentElement || document, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "id", "src", "style", "hidden"],
    });
    pollTimer = setInterval(check, pollMs);
    pollTimer?.unref?.();
  }

  async function waitUntilClear() {
    if (disposed) return false;
    start();
    if (!check()) return true;
    if (waitPromise) return waitPromise;

    waitPromise = (async () => {
      if (!episodeNotified) {
        episodeNotified = true;
        await notifyChallenge?.(
          host,
          "Cloudflare verification needs your attention in the download tab.",
        );
      }
      const startedAt = Date.now();
      while (!disposed && Date.now() - startedAt < timeoutMs) {
        try {
          await sleep(500, cancellation.signal);
        } catch {
          return false;
        }
        if (disposed) return false;
        if (!check()) return true;
      }
      return false;
    })().finally(() => {
      waitPromise = null;
    });
    return waitPromise;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancellation.abort();
    observer?.disconnect?.();
    observer = null;
    clearInterval(pollTimer);
    clearTimeout(mutationTimer);
    pollTimer = null;
    mutationTimer = null;
    textBody = null;
    textValue = "";
  }

  return {
    dispose,
    isBlocked: () => check(),
    start,
    waitUntilClear,
  };
}

export const __cloudflareChallengeTestInternals = Object.freeze({
  selectors: CHALLENGE_SELECTORS,
});
