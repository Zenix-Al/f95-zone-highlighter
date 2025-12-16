import { state } from "../constants";

export function skipMaskedPage() {
  if (!location.pathname.startsWith("/masked/") || location.pathname === "/masked/") return;

  // Auto-click the continue button if present (most reliable now)
  const continueBtn = document.querySelector(".host_link");
  if (continueBtn) {
    continueBtn.click();
    return; // Done, no need for fancy XHR
  }

  // Fallback to old XHR method if no button (rare?)
  const $loading = document.getElementById("loading");
  const $captchaDiv = document.getElementById("captcha");
  const $error = document.getElementById("error");

  function handleError(title, message) {
    if ($error) $error.innerHTML = `<h2>${title}</h2><p>${message}</p>`;
    if ($loading) $loading.style.display = "none";
  }

  if ($loading) $loading.style.display = "block";

  function sendRequest(token = "") {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", location.pathname, true);
    xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          try {
            const res = JSON.parse(xhr.responseText);
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
            } else {
              handleError("Error", res.msg || "Unknown");
            }
          } catch (e) {
            handleError("Bad Response", "Try refreshing");
          }
        } else {
          handleError("Server Error", "Chill and retry");
        }
      }
    };
    xhr.send(`xhr=1&download=1${token ? "&captcha=" + token : ""}`);
  }

  sendRequest();
}

// Hijack clicks on thread pages
export function hijackMaskedLinks() {
  if (location.pathname.startsWith("/masked/")) return;
  if (state.isMaskedLinkApplied) return;
  state.isMaskedLinkApplied = true;
  const handler = function (e) {
    if (e.button !== 0 && e.button !== 1) return; // Only left or middle

    let link = e.target.closest('a[href^="/masked/"], a[href^="https://f95zone.to/masked/"]');
    if (!link) return;

    let href = link.getAttribute("href");
    if (href.startsWith("/masked/")) {
      href = "https://f95zone.to" + href;
    }
    const path = new URL(href).pathname;

    e.preventDefault();
    e.stopImmediatePropagation();

    link.style.color = "#ffff00"; // Yellow while working

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "https://f95zone.to" + path, true);
    xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        let targetUrl = href; // Default fallback to masked
        if (xhr.status === 200) {
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.status === "ok" && data.msg) {
              targetUrl = data.msg;
              link.style.color = "#00ff00"; // Green success
            }
          } catch (_) {}
        }
        // Redirect properly
        window.open(targetUrl, "_blank");
      }
    };
    xhr.send("xhr=1&download=1");
  };

  // Listen to both click (left) and auxclick (middle/right/non-primary)
  document.addEventListener("click", handler, true);
  document.addEventListener("auxclick", handler, true);
}
