/* global grecaptcha */
import { F95_CAPTCHA_SITEKEY, TIMINGS, SELECTORS } from "../../constants.js";
import { queryFirstBySelectors } from "../../shared/utils.js";
import { resolveMaskedLink as resolveMaskedLinkTransport } from "./maskedResolutionTransport.js";

const CAPTCHA_READY_TIMEOUT_MS = 5000;
const CAPTCHA_READY_POLL_MS = 100;

export function createMaskedPageController({
  addTeardown,
  readThreadFlags,
  normalizeUrl,
  deliverDestination = (url) => {
    location.href = url;
  },
  resolveMaskedLink = resolveMaskedLinkTransport,
  getCaptchaApi = () =>
    typeof grecaptcha === "undefined" ? null : grecaptcha,
  sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
  now = Date.now,
}) {
  let state = "idle";
  let operation = null;
  let activeRequest = null;
  let disposed = false;
  let teardownRegistered = false;
  let generation = 0;

  function isMaskedPage() {
    return location.hostname.includes("f95zone.to") && location.pathname.startsWith("/masked");
  }

  function isRecaptchaFrame() {
    const isRecaptchaHost =
      location.hostname.includes("google.com") || location.hostname.includes("recaptcha.net");
    return isRecaptchaHost && location.pathname.startsWith("/recaptcha/");
  }

  function getPageNodes() {
    return {
      loading: document.getElementById(SELECTORS.MASKED_PAGE.IDS.LOADING),
      captcha: document.getElementById(SELECTORS.MASKED_PAGE.IDS.CAPTCHA),
      error: document.getElementById(SELECTORS.MASKED_PAGE.IDS.ERROR),
    };
  }

  function showError(nodes, title = "Server Error", message = "Please try again in a few moments.", owner = generation) {
    if (disposed || owner !== generation) return;
    state = "failed";
    if (nodes.error) {
      nodes.error.innerHTML = `<h2>${title}</h2><p>${message}</p>`;
      nodes.error.style.display = "block";
    }
    if (nodes.loading) nodes.loading.style.display = "none";
  }

  async function requestResolution(token = "") {
    activeRequest = resolveMaskedLink(location.pathname, { token });
    try {
      return await activeRequest;
    } finally {
      activeRequest = null;
    }
  }

  async function waitForCaptchaApi() {
    const deadline = now() + CAPTCHA_READY_TIMEOUT_MS;
    let api = getCaptchaApi();
    while (!api?.render && !disposed && now() < deadline) {
      await sleep(CAPTCHA_READY_POLL_MS);
      api = getCaptchaApi();
    }
    return api?.render ? api : null;
  }

  async function deliverResolved(response, nodes, owner) {
    if (disposed || owner !== generation) return;
    if (response?.status !== "ok" || typeof response.msg !== "string") {
      showError(nodes, "Invalid response", "The masked destination could not be resolved.", owner);
      return;
    }
    const destination = normalizeUrl(response.msg, "");
    if (!destination) {
      showError(nodes, "Invalid destination", "The resolved download URL is invalid.", owner);
      return;
    }
    state = "redirecting";
    await deliverDestination(destination);
  }

  async function handleCaptcha(nodes, owner) {
    state = "captcha";
    const api = await waitForCaptchaApi();
    if (!api || disposed || owner !== generation || !nodes.captcha) {
      showError(nodes, "Captcha unavailable", "Complete the page manually or try again.", owner);
      return;
    }
    nodes.captcha.style.display = "block";
    await new Promise((resolve) => {
      let accepted = false;
      api.render("captcha", {
        theme: "dark",
        sitekey: F95_CAPTCHA_SITEKEY,
        callback: async (token) => {
          if (accepted || disposed || owner !== generation) return;
          accepted = true;
          nodes.captcha.style.display = "none";
          if (nodes.loading) nodes.loading.style.display = "block";
          try {
            await deliverResolved(await requestResolution(token), nodes, owner);
          } catch {
            showError(nodes, undefined, undefined, owner);
          }
          resolve();
        },
      });
    });
  }

  async function runOperation(owner) {
    const flags = await readThreadFlags(false);
    if (disposed || owner !== generation || flags.skipMaskedLink === false) return;

    const continueBtn = queryFirstBySelectors(SELECTORS.MASKED_PAGE.CONTINUE_BTN_CANDIDATES);
    if (continueBtn) {
      continueBtn.click();
      state = "redirecting";
      return;
    }

    const leaving = queryFirstBySelectors(SELECTORS.MASKED_PAGE.LEAVING_CANDIDATES);
    if (leaving) {
      leaving.style.width = `${leaving.offsetWidth}px`;
      const text = queryFirstBySelectors(SELECTORS.MASKED_PAGE.LEAVING_TEXT_CANDIDATES, leaving);
      if (text) text.style.display = "none";
    }
    const nodes = getPageNodes();
    if (nodes.loading) nodes.loading.style.display = "block";
    state = "resolving";
    try {
      const response = await requestResolution();
      if (response?.status === "captcha") await handleCaptcha(nodes, owner);
      else await deliverResolved(response, nodes, owner);
    } catch {
      showError(nodes, undefined, undefined, owner);
    }
  }

  function startOperation() {
    if (disposed) return Promise.resolve();
    if (!operation) operation = runOperation(generation);
    return operation;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    generation += 1;
    state = "disposed";
    activeRequest?.abort?.();
    teardownRegistered = false;
  }

  function enableMaskedPageHooks({ isEnabled, isBlockedByCore }) {
    if (disposed) {
      disposed = false;
      operation = null;
      state = "idle";
    }
    if (!teardownRegistered) {
      teardownRegistered = true;
      addTeardown(dispose);
    }
    if (!isEnabled || isBlockedByCore) return Promise.resolve();
    return startOperation();
  }

  function handleRecaptcha() {
    if (!location.href.includes(F95_CAPTCHA_SITEKEY)) return;
    const timer = setInterval(() => {
      const checkbox =
        document.querySelector(".recaptcha-checkbox-checkmark") ||
        document.querySelector(".recaptcha-checkbox-border");
      if (!checkbox) return;
      checkbox.click();
      clearInterval(timer);
    }, TIMINGS.RECAPTCHA_CLICK_INTERVAL);
    addTeardown(() => clearInterval(timer));
  }

  return {
    resolveMaskedLink,
    handleRecaptcha,
    isMaskedPage,
    isRecaptchaFrame,
    enableMaskedPageHooks,
    getOperationState: () => state,
    dispose,
  };
}
