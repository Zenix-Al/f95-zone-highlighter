const CHALLENGE_SELECTORS = [
  "#challenge-running",
  "#challenge-stage",
  "#cf-chl-widget",
  'iframe[src*="challenges.cloudflare.com"]',
];

const DEFAULT_POLL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const MUTATION_DEBOUNCE_MS = 100;

export function isCloudflareChallengePage(root = document) {
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
    const text = String(root.body?.textContent || "")
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

export async function waitForCloudflareChallenge({
  debugLog,
  host,
  notifyChallenge,
  preserveRequest,
  pollMs = DEFAULT_POLL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (!isCloudflareChallengePage()) return { detected: false, cleared: true };

  debugLog?.("DownloadHooks", "Cloudflare challenge detected.", { host });
  await notifyChallenge?.(
    host,
    "Cloudflare verification needs your attention in the download tab.",
  );

  const startedAt = Date.now();
  let lastPreservedAt = 0;
  while (Date.now() - startedAt < timeoutMs) {
    if (Date.now() - lastPreservedAt >= 30 * 1000) {
      await preserveRequest?.();
      lastPreservedAt = Date.now();
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    if (!isCloudflareChallengePage()) {
      debugLog?.("DownloadHooks", "Cloudflare challenge cleared.", { host });
      return { detected: true, cleared: true };
    }
  }

  debugLog?.("DownloadHooks", "Cloudflare challenge wait timed out.", {
    host,
  });
  return { detected: true, cleared: false };
}

export function createCloudflareChallengeMonitor({
  debugLog,
  host,
  notifyChallenge,
  preserveRequest,
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

  const check = () => {
    if (disposed) return false;
    const next = isCloudflareChallengePage();
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

  const scheduleCheck = () => {
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
      attributes: true,
      attributeFilter: ["class", "id", "src", "style", "hidden"],
    });
    pollTimer = setInterval(check, pollMs);
    pollTimer?.unref?.();
  }

  async function waitUntilClear() {
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
      let lastPreservedAt = 0;
      while (!disposed && Date.now() - startedAt < timeoutMs) {
        if (Date.now() - lastPreservedAt >= 30 * 1000) {
          await preserveRequest?.();
          lastPreservedAt = Date.now();
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (!check()) return true;
      }
      return false;
    })().finally(() => {
      waitPromise = null;
    });
    return waitPromise;
  }

  function dispose() {
    disposed = true;
    observer?.disconnect?.();
    observer = null;
    clearInterval(pollTimer);
    clearTimeout(mutationTimer);
    pollTimer = null;
    mutationTimer = null;
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
