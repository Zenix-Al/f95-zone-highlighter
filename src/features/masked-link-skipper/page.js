import { config } from "../../config";
import { resolveMaskedLink } from "./resolver.js";

/**
 * On the masked page itself, this function tries to automatically
 * click the continue button or use an XHR fallback to get the real URL.
 */
export function skipMaskedPage() {
  if (!config.threadSettings.skipMaskedLink) return;
  if (!location.pathname.startsWith("/masked/") || location.pathname === "/masked/") return;

  // Auto-click the continue button if present (most reliable now)
  const continueBtn = document.querySelector(".host_link");
  if (continueBtn) {
    continueBtn.click();
    return; // Done, no need for fancy XHR
  }

  // --- Fallback to XHR method if no button ---

  // UI tweaks to prevent layout shift, inspired by F95-Zone Skipper Ultra
  const $leaving = document.querySelector(".leaving");
  if ($leaving) {
    $leaving.style.width = $leaving.offsetWidth + "px";
    const leavingText = document.querySelector(".leaving-text");
    if (leavingText) leavingText.style.display = "none";
  }

  const $loading = document.getElementById("loading");
  const $captchaDiv = document.getElementById("captcha");
  const $error = document.getElementById("error");

  function handleError(title, message, retry = false) {
    if ($error)
      $error.innerHTML = `<h2>${title}</h2><p>${message}</p>${retry ? '<p><a href="javascript:window.location.reload(true);">Retry</a></p>' : ""}`;
    if ($loading) $loading.style.display = "none";
    if ($error) $error.style.display = "block";
  }

  if ($loading) $loading.style.display = "block";

  function sendRequest(token = "") {
    resolveMaskedLink(location.pathname, { token })
      .then((res) => {
        if (res.status === "ok") {
          location.href = res.msg;
        } else if (res.status === "captcha") {
          if ($captchaDiv) {
            $captchaDiv.style.display = "block";
            grecaptcha.render("captcha", {
              theme: "dark",
              sitekey: "6LcwQ5kUAAAAAAI-_CXQtlnhdMjmFDt-MruZ2gov",
              callback: (t) => {
                $captchaDiv.style.display = "none";
                if ($loading) $loading.style.display = "block";
                sendRequest(t);
              },
            });
          }
        } else if (res.status === "error") {
          handleError("Error", res.msg || "An unknown error occurred.", true);
        } else {
          handleError("Error", res.msg || "An unknown error occurred.");
        }
      })
      .catch((error) => {
        if (error.type === "parse") {
          handleError("Bad Response", "The server's response was malformed.", true);
          console.error("skipMaskedPage parse error:", error.error);
        } else {
          handleError("Server Error", "Please try again in a few moments.", true);
        }
      });
  }

  sendRequest();
}

/**
 * This part runs inside the reCaptcha iframe to auto-click the checkbox.
 * Based on "reCaptcha Autoclick" by Streampunk.
 */
export function handleRecaptcha() {
  const f95SiteKey = "6LcwQ5kUAAAAAAI-_CXQtlnhdMjmFDt-MruZ2gov";
  if (!window.location.href.includes(f95SiteKey)) return;

  const clickInterval = setInterval(function () {
    const $box =
      document.querySelector(".recaptcha-checkbox-checkmark") ||
      document.querySelector(".recaptcha-checkbox-border");
    if ($box) {
      $box.click();
      clearInterval(clickInterval);
    }
  }, 500);
}
