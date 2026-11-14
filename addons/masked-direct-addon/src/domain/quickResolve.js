import { isHcaptchaActive } from "../app/contexts/continuePageController.js";
import { isCloudflareChallengePage } from "../hosts/shared/cloudflareChallenge.js";
import { sleep } from "../shared/utils.js";

export function getQuickResolveUrl(value, base = location.href) {
  try {
    const origin = new URL(base);
    const url = new URL(value, base);
    return origin.protocol === "https:" &&
      ["f95zone.to", "www.f95zone.to"].includes(origin.hostname) &&
      url.origin === origin.origin &&
      !url.username &&
      !url.password &&
      !url.hash &&
      /^\/dl\/\d+\/?$/.test(url.pathname)
      ? url
      : null;
  } catch {
    return null;
  }
}

function requireNoVerification(doc) {
  if (
    isHcaptchaActive(doc) ||
    isCloudflareChallengePage(doc) ||
    doc.querySelector(
      ".g-recaptcha, .cf-turnstile, [data-sitekey], iframe[src*='recaptcha'], [data-xf-init*='captcha']",
    )
  )
    throw new Error("Verification required. Open the original link and continue manually.");
}

export async function resolveQuickDownload(
  value,
  { baseUrl = location.href, fetchFn = fetch, signal, wait = sleep } = {},
) {
  const source = getQuickResolveUrl(value, baseUrl);
  if (!source) throw new Error("Unsupported download link.");
  const parse = (html) => new DOMParser().parseFromString(html, "text/html");
  async function request(url, options = {}) {
    signal?.throwIfAborted();
    const timeout = new AbortController();
    const cancel = () => timeout.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(cancel, 20000);
    try {
      const response = await fetchFn(url, {
        ...options,
        credentials: "same-origin",
        redirect: "error",
        signal: timeout.signal,
      });
      const doc = parse(await response.text());
      signal?.throwIfAborted();
      requireNoVerification(doc);
      if (!response.ok)
        throw new Error(
          `Download request failed (HTTP ${response.status}). Use the original link.`,
        );
      return doc;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    }
  }
  const doc = await request(source.href);
  const page = doc.querySelector('[data-xf-init~="f95dl-page"]');
  const button = page?.querySelector(".js-f95dlContinue");
  const form = button?.form || page?.querySelector("form.f95dl-box");
  if (!form || form.method.toLowerCase() !== "post")
    throw new Error("Download form changed. Use the original link.");
  const action = new URL(form.getAttribute("action") || source.href, source.href);
  if (
    action.origin !== source.origin ||
    action.username ||
    action.password ||
    action.hash ||
    !/^\/dl\/\d+\/?$/.test(action.pathname) ||
    action.pathname.replace(/\/$/, "") !== source.pathname.replace(/\/$/, "")
  )
    throw new Error("Unexpected download form destination. Use the original link.");
  const encoded = page.getAttribute("data-code") || page.getAttribute("data-f95dl-page-code");
  const code = page.querySelector(".js-f95dlCode");
  if (encoded) {
    if (!code) throw new Error("Download code field missing. Use the original link.");
    try {
      code.value = atob(encoded.replace(/^c/, "")).split("").reverse().join("");
    } catch {
      throw new Error("Download code could not be read. Use the original link.");
    }
  }
  const csrf = form.querySelector('input[name="_xfToken"]');
  if (!csrf) throw new Error("Download form token missing. Use the original link.");
  csrf.value ||= doc.documentElement.getAttribute("data-csrf") || "";
  if (!csrf.value) throw new Error("Download form token missing. Use the original link.");
  const hadCheck = form.querySelector('input[name="had_check"]');
  // Native form preparation, only after rejecting verification; no CAPTCHA token is fabricated.
  if (hadCheck) hadCheck.value = "1";
  const data = new FormData(form);
  if (button?.name && !button.disabled) data.append(button.name, button.value);
  if ([...data.values()].some((item) => typeof item !== "string"))
    throw new Error("Unexpected download form fields.");
  await wait(2200, signal);
  signal?.throwIfAborted();
  const result = await request(action.href, {
    method: "POST",
    body: new URLSearchParams(data),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
    },
  });
  const raw = result.querySelector('[data-xf-init~="f95dl-go"]')?.getAttribute("data-url");
  let destination;
  try {
    destination = new URL(raw || "");
  } catch {
    /* Reject unknown response structures. */
  }
  if (
    !destination ||
    !["http:", "https:"].includes(destination.protocol) ||
    destination.username ||
    destination.password ||
    destination.origin === source.origin
  )
    throw new Error("Destination not found or unsafe. Use the original link.");
  return destination.href;
}
