import { isAutomationEnabled } from "../../shared/utils.js";
// Follow the site's native form behavior. This is not a final download action:
// never invoke the host success/feedback/auto-close pipeline here.

export function isHcaptchaActive(documentRef = document) {
  try {
    const form = documentRef
      .querySelector?.(".f95dl-go button.js-f95dlContinue[type='submit']")
      ?.closest("form");
    const root = form || documentRef;
    const responses = Array.from(
      root.querySelectorAll(
        'textarea[name="h-captcha-response"], input[name="h-captcha-response"]',
      ),
    );
    if (responses.length > 0 && responses.every((element) => String(element.value || "").trim())) {
      return false;
    }
    return Boolean(
      responses.length ||
      root.querySelector(
        "input[name='had_check'][value='1'], [data-xf-init~='h-captcha'], .f95dl-check-box, .f95dl-check-explain, .h-captcha, iframe[src*='hcaptcha.com']",
      ),
    );
  } catch {
    return true; // Unknown verification state must leave Continue manual.
  }
}

export function createContinuePageController({
  getAutomationSettings,
  documentRef = document,
  windowRef = window,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
}) {
  let stopped = false;
  let started = false;
  let timer = null;

  function dispose() {
    stopped = true;
    if (timer !== null) clearTimeoutFn(timer);
    timer = null;
    windowRef.removeEventListener("pagehide", dispose);
  }

  async function run() {
    if (started) return;
    started = true;
    windowRef.addEventListener("pagehide", dispose);
    let attempts = 0;
    async function check() {
      timer = null;
      try {
        const automationSettings = await getAutomationSettings();
        if (stopped) return;
        if (!isAutomationEnabled(automationSettings) || automationSettings.skipMaskedPage === false)
          return dispose();
        if (isHcaptchaActive(documentRef)) return dispose();
        const button = documentRef.querySelector(
          ".f95dl-go button.js-f95dlContinue[type='submit']",
        );
        if (
          button &&
          !button.disabled &&
          !button.closest("[hidden], .u-hidden") &&
          button.getAttribute("aria-disabled") !== "true"
        ) {
          timer = setTimeoutFn(async () => {
            timer = null;
            try {
              const latest = await getAutomationSettings();
              if (stopped) return;
              if (
                isAutomationEnabled(latest) &&
                latest.skipMaskedPage !== false &&
                !isHcaptchaActive(documentRef) &&
                button.isConnected &&
                !button.disabled &&
                !button.closest("[hidden], .u-hidden") &&
                button.getAttribute("aria-disabled") !== "true"
              ) {
                dispose(); // One click only, even if navigation is prevented.
                button.click();
              } else dispose();
            } catch {
              dispose();
            }
          }, 250);
          return;
        }
        if (++attempts >= 40) return dispose();
        timer = setTimeoutFn(check, 250);
      } catch {
        dispose(); // Storage failure must not authorize navigation.
      }
    }
    await check();
  }

  return { run, dispose };
}
