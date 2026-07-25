/* global grecaptcha */
import { F95_CAPTCHA_SITEKEY, TIMINGS, SELECTORS } from "../../constants.js";
import { queryFirstBySelectors } from "../../shared/utils.js";

function resolveMaskedLink(url, { token = "" } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");

    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status === 200) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch (error) {
          reject({ type: "parse", error });
        }
      } else {
        reject({ type: "http", status: xhr.status });
      }
    };

    xhr.send(`xhr=1&download=1${token ? `&captcha=${token}` : ""}`);
  });
}

export function createMaskedPageController({ addTeardown, readThreadFlags, normalizeUrl }) {
  function isMaskedPage() {
    return location.hostname.includes("f95zone.to") && location.pathname.startsWith("/masked");
  }

  function isRecaptchaFrame() {
    const isRecaptchaHost =
      location.hostname.includes("google.com") || location.hostname.includes("recaptcha.net");
    return isRecaptchaHost && location.pathname.startsWith("/recaptcha/");
  }

  async function trySkipMaskedPage() {
    const flags = await readThreadFlags(false);
    if (flags.skipMaskedLink === false) return;

    const continueBtn = queryFirstBySelectors(SELECTORS.MASKED_PAGE.CONTINUE_BTN_CANDIDATES);
    if (continueBtn) {
      continueBtn.click();
      return;
    }

    const leaving = queryFirstBySelectors(SELECTORS.MASKED_PAGE.LEAVING_CANDIDATES);
    if (leaving) {
      leaving.style.width = `${leaving.offsetWidth}px`;
      const leavingText = queryFirstBySelectors(
        SELECTORS.MASKED_PAGE.LEAVING_TEXT_CANDIDATES,
        leaving,
      );
      if (leavingText) leavingText.style.display = "none";
    }

    const loading = document.getElementById(SELECTORS.MASKED_PAGE.IDS.LOADING);
    const captchaDiv = document.getElementById(SELECTORS.MASKED_PAGE.IDS.CAPTCHA);
    const errorNode = document.getElementById(SELECTORS.MASKED_PAGE.IDS.ERROR);
    if (loading) loading.style.display = "block";

    let resolved = null;
    try {
      resolved = await resolveMaskedLink(location.pathname);
    } catch {
      if (errorNode) {
        errorNode.innerHTML = `<h2>Server Error</h2><p>Please try again in a few moments.</p>`;
        errorNode.style.display = "block";
      }
      if (loading) loading.style.display = "none";
      return;
    }

    if (!resolved) return;

    if (resolved.status === "captcha" && captchaDiv && typeof grecaptcha !== "undefined") {
      captchaDiv.style.display = "block";
      grecaptcha.render("captcha", {
        theme: "dark",
        sitekey: F95_CAPTCHA_SITEKEY,
        callback: async (token) => {
          captchaDiv.style.display = "none";
          if (loading) loading.style.display = "block";
          const retry = await resolveMaskedLink(location.pathname, { token });
          if (retry?.status === "ok" && retry.msg) {
            const destination = normalizeUrl(retry.msg, "");
            if (destination) location.href = destination;
          }
        },
      });
      return;
    }

    if (resolved.status === "ok" && resolved.msg) {
      const destination = normalizeUrl(resolved.msg, "");
      if (destination) location.href = destination;
    }
  }

  function enableMaskedPageHooks({ isEnabled, isBlockedByCore }) {
    const timer = setInterval(() => {
      if (isEnabled && !isBlockedByCore) {
        void trySkipMaskedPage();
      }
    }, 900);
    addTeardown(() => clearInterval(timer));

    void trySkipMaskedPage();
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
  };
}
