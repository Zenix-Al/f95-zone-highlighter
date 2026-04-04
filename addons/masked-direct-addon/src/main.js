/* global __ADDON_ID__, __ADDON_CAPABILITIES__, __ADDON_REQUIRES_CORE__, GM_openInTab, GM, GM_addValueChangeListener, GM_removeValueChangeListener, grecaptcha */
import { createCoreBridge } from "./coreBridge.js";
import {
  ADDON_COMMAND_EVENT,
  RESOLVE_BTN_CLASS,
  MASKED_LINK_SELECTOR,
  F95_CAPTCHA_SITEKEY,
  AUTOMATION_MARKER_KEY,
  TIMINGS,
  SELECTORS,
} from "./constants.js";
import {
  createDebugLog,
  isLikelyDirectDownloadAnchor,
  normalizeUrl,
  queryFirstBySelectors,
  withAutomationMarker,
} from "./utils.js";
import { createAddonUi } from "./ui.js";
import { processPixeldrainDownload } from "./hosts/pixeldrain.js";
import { processGofileDownload } from "./hosts/gofile.js";
import { createDatanodesStageStore, processDatanodesDownload } from "./hosts/datanodes.js";
import { processBuzzheavierDownload } from "./hosts/buzzheavier.js";

const runtime = {
  addonId: typeof __ADDON_ID__ === "string" ? __ADDON_ID__ : "masked-direct-addon",
  capabilities: Array.isArray(__ADDON_CAPABILITIES__) ? __ADDON_CAPABILITIES__ : [],
  requiresCore: Boolean(__ADDON_REQUIRES_CORE__),
};

const bridge = createCoreBridge(runtime.addonId);
const debugLog = createDebugLog(runtime.addonId);

let isEnabled = true;
let isBlockedByCore = false;
let teardownFns = [];
let settingsCache = null;
let settingsCacheTs = 0;
let addonCommandHandlerBound = false;
const ADDON_SETTINGS_KEY = "settings";
const ADDON_SETTINGS_DEFAULT = Object.freeze({
  skipMaskedLink: true,
  directDownloadLinks: true,
  directDownloadPackages: {
    buzzheavier: true,
    gofile: true,
    pixeldrain: true,
    datanodes: true,
  },
});
const ADDON_PANEL_SETTINGS = Object.freeze([
  {
    id: "skipMaskedLink",
    path: "skipMaskedLink",
    text: "Resolve button on masked links",
    tooltip:
      "Show a Resolve button next to masked links. Native clicks stay unchanged; Resolve performs masked-link resolution and direct-download routing.",
  },
  {
    id: "directDownloadLinks",
    path: "directDownloadLinks",
    text: "Direct Download Links",
    tooltip:
      "Enable direct download links for supported file hosts. Works independently outside of masked links.",
  },
  {
    id: "buzzheavier",
    path: "directDownloadPackages.buzzheavier",
    text: "Buzzheavier",
    tooltip: "Enable direct download automation for buzzheavier.com",
  },
  {
    id: "gofile",
    path: "directDownloadPackages.gofile",
    text: "Gofile package",
    tooltip: "Enable direct download automation for gofile.io",
  },
  {
    id: "pixeldrain",
    path: "directDownloadPackages.pixeldrain",
    text: "Pixeldrain",
    tooltip: "Enable direct download automation for pixeldrain.com",
  },
  {
    id: "datanodes",
    path: "directDownloadPackages.datanodes",
    text: "Datanodes",
    tooltip: "Enable direct download automation for datanodes.to",
  },
]);
const DIRECT_DOWNLOAD_ATTENTION_KEY = "f95ue.addon.directDownloadAttentionEvent";
const DIRECT_DOWNLOAD_TAB_ID_KEY = "f95ue.addon.directDownload.tabId";
const ORIGIN_TAB_QUERY_KEY = "f95ue_tab";
let attentionListenerId = null;
let lastAttentionTs = 0;
let lastAttentionId = "";

function addTeardown(fn) {
  if (typeof fn === "function") teardownFns.push(fn);
}

const ui = createAddonUi({
  addonId: runtime.addonId,
  buttonClass: RESOLVE_BTN_CLASS,
  addTeardown,
});

function showToast(message, duration = 2600) {
  // On f95zone pages the core is present — route through it so the toast uses
  // the same container and styling as the rest of the UI.
  // On download-host pages (gofile, pixeldrain, datanodes) the core is not
  // loaded, so fall back to the local addon toast.
  if (location.hostname.includes("f95zone.to")) {
    void bridge
      .invokeCoreAction("toast.show", { message })
      .then((result) => {
        if (!result?.ok) ui.showToast(message, duration);
      })
      .catch(() => ui.showToast(message, duration));
    return;
  }
  ui.showToast(message, duration);
}
const datanodesStageStore = createDatanodesStageStore();

function getLocalAttentionTabId() {
  try {
    const existing = sessionStorage.getItem(DIRECT_DOWNLOAD_TAB_ID_KEY);
    if (existing && existing.trim()) return existing;
    const generated = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(DIRECT_DOWNLOAD_TAB_ID_KEY, generated);
    return generated;
  } catch {
    return `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

const localAttentionTabId = getLocalAttentionTabId();

function clearTeardowns() {
  for (const fn of teardownFns.splice(0)) {
    try {
      fn();
    } catch {
      // best effort
    }
  }
}

function isThreadPage() {
  return location.hostname.includes("f95zone.to") && location.pathname.startsWith("/threads");
}

function isMaskedPage() {
  return location.hostname.includes("f95zone.to") && location.pathname.startsWith("/masked");
}

function isRecaptchaFrame() {
  const isRecaptchaHost =
    location.hostname.includes("google.com") || location.hostname.includes("recaptcha.net");
  return isRecaptchaHost && location.pathname.startsWith("/recaptcha/");
}

function getDownloadHost() {
  const host = String(location.hostname || "").toLowerCase();
  if (host.includes("buzzheavier.com")) return "buzzheavier.com";
  if (host.includes("gofile.io")) return "gofile.io";
  if (host.includes("api.gofile.com")) return "api.gofile.com";
  if (host.includes("pixeldrain.com")) return "pixeldrain.com";
  if (host.includes("datanodes.to")) return "datanodes.to";
  return "";
}

function isRelevantPage() {
  return Boolean(isThreadPage() || isMaskedPage() || getDownloadHost());
}

function shouldRunHostAutomation(host) {
  if (!host || !isEnabled || isBlockedByCore) return false;
  let marker = "";
  let originTabId = "";
  try {
    const parsed = new URL(location.href);
    marker = String(parsed.searchParams.get(AUTOMATION_MARKER_KEY) || "").trim();
    originTabId = String(parsed.searchParams.get(ORIGIN_TAB_QUERY_KEY) || "").trim();
  } catch {
    marker = "";
    originTabId = "";
  }

  if (marker === "1") return true;
  if (originTabId) return true;

  if (host === "datanodes.to") {
    const path = String(location.pathname || "").toLowerCase();
    if (path.includes("download")) return true;

    if (datanodesStageStore.read()) return true;

    // Datanodes sometimes strips unknown query params during host-side redirects.
    // If we land on its canonical download flow and came from f95zone, keep
    // automation enabled for this tab.
    const referrer = String(document.referrer || "").toLowerCase();
    if (referrer.includes("f95zone.to") && path.includes("download")) return true;
  }

  return false;
}

function getOriginTabIdFromLocation() {
  try {
    return String(new URL(location.href).searchParams.get(ORIGIN_TAB_QUERY_KEY) || "").trim();
  } catch {
    return "";
  }
}

async function publishDirectDownloadAttention(host, message) {
  if (!GM || typeof GM.setValue !== "function") return;
  const payload = {
    ts: Date.now(),
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    host: String(host || "unknown"),
    message: String(message || "Direct download needs manual action."),
    href: location.href,
    targetTabId: getOriginTabIdFromLocation() || null,
  };
  try {
    await GM.setValue(DIRECT_DOWNLOAD_ATTENTION_KEY, payload);
  } catch {
    // best effort
  }
}

function showAttentionNotice(payload) {
  if (!payload || typeof payload !== "object") return;
  const targetTabId = String(payload.targetTabId || "").trim();
  if (targetTabId && targetTabId !== localAttentionTabId) return;

  const ts = Number(payload.ts || 0);
  if (Number.isFinite(ts) && ts > 0) {
    if (ts <= lastAttentionTs) return;
    lastAttentionTs = ts;
  }

  const eventId = String(payload.id || "").trim();
  if (eventId && eventId === lastAttentionId) return;
  if (eventId) lastAttentionId = eventId;

  const message = String(payload.message || "Direct download needs manual action.").trim();
  if (!message) return;
  showToast(`Direct Download: ${message}`, 6000);
}

function enableDirectDownloadAttentionListener() {
  if (!isThreadPage()) return;
  if (attentionListenerId !== null) return;
  if (typeof GM_addValueChangeListener !== "function") return;
  attentionListenerId = GM_addValueChangeListener(
    DIRECT_DOWNLOAD_ATTENTION_KEY,
    (_name, _oldVal, newVal, remote) => {
      if (!remote) return;
      showAttentionNotice(newVal);
    },
  );
  addTeardown(() => {
    if (attentionListenerId === null) return;
    if (typeof GM_removeValueChangeListener === "function") {
      GM_removeValueChangeListener(attentionListenerId);
    }
    attentionListenerId = null;
  });
}

function isHostAllowedInSettings(hostname, flags) {
  const packages = flags?.directDownloadPackages;
  if (!packages || typeof packages !== "object") return true;
  if (hostname.includes("gofile.io") || hostname.includes("api.gofile.com")) {
    return packages.gofile !== false;
  }
  if (hostname.includes("buzzheavier.com")) {
    return packages.buzzheavier !== false;
  }
  if (hostname.includes("pixeldrain.com")) {
    return packages.pixeldrain !== false;
  }
  if (hostname.includes("datanodes.to")) {
    return packages.datanodes !== false;
  }
  return true;
}

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

function routeToDirectDownload(url) {
  const normalized = normalizeUrl(url, "");
  if (!normalized) return;

  let host = "";
  try {
    host = new URL(normalized).hostname.toLowerCase();
  } catch {
    host = "";
  }

  const isSupportedHost =
    host.includes("buzzheavier.com") ||
    host.includes("gofile.io") ||
    host.includes("api.gofile.com") ||
    host.includes("pixeldrain.com") ||
    host.includes("datanodes.to");
  let safeUrl = isSupportedHost ? withAutomationMarker(normalized) : normalized;
  if (isSupportedHost && safeUrl) {
    try {
      const parsed = new URL(safeUrl);
      if (!parsed.searchParams.get(ORIGIN_TAB_QUERY_KEY)) {
        parsed.searchParams.set(ORIGIN_TAB_QUERY_KEY, localAttentionTabId);
      }
      safeUrl = parsed.href;
    } catch {
      // keep safeUrl as-is
    }
  }
  if (!safeUrl) return;

  if (isSupportedHost && typeof GM_openInTab === "function") {
    GM_openInTab(safeUrl, {
      active: false,
      insert: true,
      setParent: true,
    });
    return;
  }

  window.open(safeUrl, "_blank", "noopener,noreferrer");
}

function openLinkNormally(url, anchorEl = null) {
  const safeUrl = normalizeUrl(url, "");
  if (!safeUrl) return;

  const target = String(anchorEl?.getAttribute?.("target") || "").toLowerCase();
  if (target === "_blank") {
    window.open(safeUrl, "_blank", "noopener,noreferrer");
    return;
  }

  window.location.assign(safeUrl);
}

async function notifyMainFailure(hostLabel, message) {
  const text = `Direct download (${hostLabel}) failed: ${String(message || "unknown error")}`;
  showToast(text, 4200);
  await publishDirectDownloadAttention(hostLabel, text);

  try {
    await bridge.invokeCoreAction("toast.show", { message: text });
  } catch {
    // best effort
  }

  bridge.dispatchCoreCommand("update-status", {
    addonId: runtime.addonId,
    status: "error",
    statusMessage: text,
  });
}

function statusMessage() {
  if (isBlockedByCore) {
    return "Blocked by main settings: enable untrusted add-ons or trust this add-on.";
  }
  return isEnabled
    ? "Masked-link skipper and direct-download routing are active."
    : "Masked/direct add-on is currently disabled.";
}

function reportAddonHealthy() {
  bridge.dispatchCoreCommand("update-status", {
    addonId: runtime.addonId,
    status: isEnabled ? "installed" : "disabled",
    statusMessage: statusMessage(),
  });
  // On download-host tabs opened by the add-on, close the tab once automation
  // succeeds so the user isn't left with orphaned tabs.
  if (getDownloadHost()) {
    setTimeout(() => window.close(), 1200);
  }
}

async function readThreadFlags(force = false) {
  const now = Date.now();
  if (!force && settingsCache && now - settingsCacheTs < 1500) {
    return settingsCache;
  }

  const result = await storageGet(ADDON_SETTINGS_KEY, ADDON_SETTINGS_DEFAULT);
  const parsed = result && typeof result === "object" ? result : ADDON_SETTINGS_DEFAULT;
  settingsCache = {
    skipMaskedLink: parsed.skipMaskedLink !== false,
    directDownloadLinks: parsed.directDownloadLinks !== false,
    directDownloadPackages: {
      buzzheavier: parsed.directDownloadPackages?.buzzheavier !== false,
      gofile: parsed.directDownloadPackages?.gofile !== false,
      pixeldrain: parsed.directDownloadPackages?.pixeldrain !== false,
      datanodes: parsed.directDownloadPackages?.datanodes !== false,
    },
  };
  settingsCacheTs = now;
  return settingsCache;
}

function buttonFor(link) {
  const next = link.nextElementSibling;
  if (!(next instanceof HTMLButtonElement)) return null;
  if (!next.classList.contains(RESOLVE_BTN_CLASS)) return null;
  return next;
}

function createActionButton(type, payloadUrl) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = RESOLVE_BTN_CLASS;
  btn.dataset.actionType = type;

  if (type === "masked") {
    btn.textContent = "Resolve";
    btn.title = "Resolve masked link and route download";
    btn.dataset.maskedHref = payloadUrl;
  } else {
    btn.textContent = "Direct DL";
    btn.title = "Route supported host link through direct-download flow";
    btn.dataset.directHref = payloadUrl;
  }

  return btn;
}

function toMaskedAbsoluteHref(href) {
  const raw = String(href || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/masked/")) return `https://f95zone.to${raw}`;
  return raw;
}

async function syncThreadLinkButton(link) {
  if (!(link instanceof HTMLAnchorElement)) return;

  const flags = await readThreadFlags(false);
  const wantsMasked = flags.skipMaskedLink !== false && link.matches(MASKED_LINK_SELECTOR);
  const wantsDirect =
    flags.directDownloadLinks !== false &&
    isLikelyDirectDownloadAnchor(link) &&
    isHostAllowedInSettings(link.hostname, flags);
  const desired = wantsMasked ? "masked" : wantsDirect ? "direct" : "";

  const existing = buttonFor(link);
  if (!desired) {
    if (existing) existing.remove();
    return;
  }

  if (existing && existing.dataset.actionType === desired) {
    if (desired === "masked") {
      const nextMaskedHref = toMaskedAbsoluteHref(link.getAttribute("href"));
      if (existing.dataset.maskedHref !== nextMaskedHref) {
        existing.dataset.maskedHref = nextMaskedHref;
        delete existing.dataset.resolvedHref;
        delete existing.dataset.resolved;
        existing.textContent = "Resolve";
      }
    } else {
      existing.dataset.directHref = normalizeUrl(link.href, "");
    }
    return;
  }

  if (existing) existing.remove();
  const payloadUrl =
    desired === "masked"
      ? toMaskedAbsoluteHref(link.getAttribute("href"))
      : normalizeUrl(link.href, "");
  link.insertAdjacentElement("afterend", createActionButton(desired, payloadUrl));
}

async function syncThreadButtons(root = document) {
  if (root instanceof HTMLAnchorElement) {
    await syncThreadLinkButton(root);
    return;
  }

  const links = root.querySelectorAll ? root.querySelectorAll("a[href]") : [];
  for (const link of links) {
    await syncThreadLinkButton(link);
  }
}

async function handleThreadResolveClick(event) {
  const btn = event.target?.closest?.(`.${RESOLVE_BTN_CLASS}`);
  if (!btn) return;
  event.preventDefault();
  event.stopPropagation();

  if (!isEnabled || isBlockedByCore) return;

  const type = String(btn.dataset.actionType || "");
  const link =
    btn.previousElementSibling instanceof HTMLAnchorElement ? btn.previousElementSibling : null;

  if (type === "masked" && btn.dataset.resolvedHref) {
    routeToDirectDownload(btn.dataset.resolvedHref);
    btn.textContent = "Open";
    return;
  }

  if (type === "direct") {
    const url = normalizeUrl(btn.dataset.directHref || "", "");
    if (!url) return;
    btn.disabled = true;
    showToast("Opening direct download...");
    routeToDirectDownload(url);
    btn.disabled = false;
    return;
  }

  const maskedHref = toMaskedAbsoluteHref(btn.dataset.maskedHref || "");
  if (!maskedHref) return;

  btn.disabled = true;
  btn.textContent = "...";
  showToast("Resolving masked link...");

  let resolved = null;
  try {
    resolved = await resolveMaskedLink(maskedHref);
  } catch {
    resolved = null;
  }

  if (!resolved || resolved.status !== "ok" || !resolved.msg) {
    showToast("Could not resolve masked link.");
    showToast("Opening original link...");
    openLinkNormally(maskedHref, link);
    btn.disabled = false;
    btn.textContent = "Resolve";
    return;
  }

  const destination = normalizeUrl(resolved.msg, "");
  if (!destination) {
    showToast("Resolved URL is invalid.");
    showToast("Opening original link...");
    openLinkNormally(maskedHref, link);
    btn.disabled = false;
    btn.textContent = "Resolve";
    return;
  }

  showToast("Masked link resolved.");
  btn.dataset.resolvedHref = destination;
  btn.dataset.resolved = "true";
  routeToDirectDownload(destination);

  btn.disabled = false;
  btn.textContent = "Open";
}

function enableThreadHooks() {
  ui.ensureButtonStyle();
  enableDirectDownloadAttentionListener();

  const onClick = (event) => {
    void handleThreadResolveClick(event);
  };

  document.addEventListener("click", onClick, true);
  addTeardown(() => document.removeEventListener("click", onClick, true));

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes || []) {
        if (!(node instanceof Element)) continue;
        void syncThreadButtons(node);
      }
    }
  });

  observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
  addTeardown(() => observer.disconnect());
  addTeardown(() => {
    document.querySelectorAll(`.${RESOLVE_BTN_CLASS}`).forEach((btn) => btn.remove());
  });

  void syncThreadButtons(document);
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

function enableMaskedPageHooks() {
  const timer = setInterval(() => {
    if (!isEnabled || isBlockedByCore) return;
    void trySkipMaskedPage();
  }, 900);
  addTeardown(() => clearInterval(timer));

  void trySkipMaskedPage();
}

function enableRecaptchaHooks() {
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

async function runDownloadPageHooks() {
  const host = getDownloadHost();
  if (!host) {
    console.info(`[${runtime.addonId}] Download hooks skipped: no supported host.`);
    return;
  }

  // On download-host pages (gofile, pixeldrain, datanodes) the core does not
  // run — skip settings/flags checks and rely solely on the automation marker
  // that routeToDirectDownload() embedded in the URL.
  if (!shouldRunHostAutomation(host)) {
    console.info(
      `[${runtime.addonId}] Download hooks blocked by automation gate. host=${host} href=${location.href}`,
    );
    debugLog("DownloadHooks", "Automation gate blocked host run.", {
      host,
      href: location.href,
      referrer: document.referrer || "",
    });
    return;
  }

  const handlers = {
    "buzzheavier.com": () =>
      processBuzzheavierDownload({ showToast, notifyMainFailure, reportAddonHealthy }),
    "pixeldrain.com": () =>
      processPixeldrainDownload({ debugLog, showToast, notifyMainFailure, reportAddonHealthy }),
    "gofile.io": () => processGofileDownload({ showToast, notifyMainFailure, reportAddonHealthy }),
    "api.gofile.com": () =>
      processGofileDownload({ showToast, notifyMainFailure, reportAddonHealthy }),
    "datanodes.to": () =>
      processDatanodesDownload({
        showToast,
        notifyMainFailure,
        reportAddonHealthy,
        stageStore: datanodesStageStore,
      }),
  };
  const handler = handlers[host];
  if (!handler) {
    console.info(`[${runtime.addonId}] Download hooks skipped: no handler for host=${host}.`);
    return;
  }

  console.info(`[${runtime.addonId}] Download hooks running for host=${host}.`);

  const exec = async () => {
    await handler();
  };

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        void exec();
      },
      { once: true },
    );
    return;
  }

  await exec();
}

function applyCurrentPageBehavior() {
  clearTeardowns();
  if (!isEnabled || isBlockedByCore) return;

  try {
    if (isThreadPage()) enableThreadHooks();
    if (isMaskedPage()) enableMaskedPageHooks();
  } catch (err) {
    const message = err?.message ? String(err.message) : String(err ?? "Unknown error");
    console.error(`[${runtime.addonId}] Page behavior setup error:`, err);
    bridge.dispatchCoreCommand("update-status", {
      addonId: runtime.addonId,
      status: "error",
      statusMessage: `Page behavior setup failed: ${message}`,
    });
    return;
  }

  void runDownloadPageHooks().catch((error) => {
    void notifyMainFailure(getDownloadHost() || "unknown", error?.message || String(error));
  });
}

function registerAddon() {
  bridge.dispatchCoreCommand("register", {
    addon: {
      id: runtime.addonId,
      name: "Masked + Direct Download Add-on",
      version: "0.1.0",
      description:
        "Combines masked-link skipper with direct-download routing and download-host handlers.",
      status: isEnabled ? "installed" : "disabled",
      statusMessage: statusMessage(),
      panelTitle: "Masked + Direct Download Add-on",
      panelBody:
        "This add-on provides masked-link Resolve buttons and direct-download page handling for supported hosts.",
      panelSettingsTitle: "Direct Download Settings",
      panelSettingsDescription:
        "Configure direct download toggle and supported host packages. Some toggles control grouped domains needed for one flow.",
      panelSettingsStorageKey: ADDON_SETTINGS_KEY,
      panelSettingsDefaults: ADDON_SETTINGS_DEFAULT,
      panelSettings: ADDON_PANEL_SETTINGS,
      capabilities: runtime.capabilities,
      pageScopes: ["thread", "download", "direct-download"],
    },
  });
}

function pushStatusUpdate() {
  bridge.dispatchCoreCommand("update-status", {
    addonId: runtime.addonId,
    status: isEnabled ? "installed" : "disabled",
    statusMessage: statusMessage(),
  });
}

async function storageGet(key, defaultValue) {
  const result = await bridge.invokeCoreAction("storage.get", { key, defaultValue });
  if (!result?.ok) return defaultValue;
  return typeof result.value === "undefined" ? defaultValue : result.value;
}

function storageSet(key, value) {
  return bridge.invokeCoreAction("storage.set", { key, value });
}

function setEnabled(nextEnabled) {
  if (isBlockedByCore) {
    isEnabled = false;
    pushStatusUpdate();
    clearTeardowns();
    return;
  }

  isEnabled = Boolean(nextEnabled);
  void storageSet("enabled", isEnabled);
  pushStatusUpdate();
  applyCurrentPageBehavior();
}

function bindAddonCommands() {
  if (addonCommandHandlerBound) return;

  const handler = (event) => {
    const detail = event?.detail || {};
    if (String(detail.addonId || "") !== runtime.addonId) return;

    const command = String(detail.command || "").trim();
    if (command === "enable") {
      setEnabled(true);
    } else if (command === "disable") {
      setEnabled(false);
    } else if (command === "refresh") {
      settingsCache = null;
      settingsCacheTs = 0;
      applyCurrentPageBehavior();
    }
  };

  window.addEventListener(ADDON_COMMAND_EVENT, handler);
  addonCommandHandlerBound = true;
}

function installConsoleHelper() {
  window.__F95UE_MASKED_DIRECT_ADDON__ = {
    enable() {
      setEnabled(true);
    },
    disable() {
      setEnabled(false);
    },
    refresh() {
      settingsCache = null;
      applyCurrentPageBehavior();
    },
  };
}

async function refreshAccessState() {
  const access = await bridge.getAddonAccess();
  if (!access?.ok || !access.value) {
    isBlockedByCore = true;
    isEnabled = false;
    pushStatusUpdate();
    return false;
  }

  isBlockedByCore = Boolean(access.value.blocked);
  if (isBlockedByCore) {
    isEnabled = false;
    pushStatusUpdate();
    clearTeardowns();
    showToast("Add-on blocked by main settings.", 4200);
    return false;
  }

  return true;
}

function reportAddonBroken(err) {
  const message = err?.message
    ? String(err.message)
    : String(err ?? "Unknown initialization error");
  console.error(`[${runtime.addonId}] Fatal initialization error:`, err);
  bridge.dispatchCoreCommand("update-status", {
    addonId: runtime.addonId,
    status: "broken",
    statusMessage: `Failed to initialize: ${message}`,
  });
}

async function bootstrap() {
  if (!isRelevantPage()) return;

  // Download-host pages (gofile, pixeldrain, datanodes) run outside the main
  // site context, so they should not require core ping.
  const downloadHost = getDownloadHost();
  const pageContext = downloadHost || "unknown";
  console.info(
    `[${runtime.addonId}] Detected relevant page. Context: ${pageContext}. href=${location.href}`,
  );
  if (downloadHost) {
    console.info(
      `[${runtime.addonId}] Running download-host hooks without core ping. ${downloadHost}`,
    );
    void runDownloadPageHooks().catch((error) => {
      void notifyMainFailure(downloadHost || "unknown", error?.message || String(error));
    });
    return;
  }

  // f95zone pages (thread, masked): require core.
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let ping = { ok: false, apiVersion: "" };
  for (let i = 0; i < 3; i += 1) {
    ping = await bridge.waitForCorePing(2200 + i * 600);
    if (ping.ok) break;
    await wait(300 + i * 250);
  }

  if (!ping.ok && runtime.requiresCore) {
    const accessProbe = await bridge.getAddonAccess();
    if (accessProbe?.ok) {
      ping = { ok: true, apiVersion: "probed" };
    }
  }

  if (!ping.ok && runtime.requiresCore) {
    console.info(`[${runtime.addonId}] F95UE core not detected; add-on skipped.`);
    console.info(`status: ${JSON.stringify(ping)}`);
    return;
  }

  registerAddon();
  bindAddonCommands();

  try {
    const hasAccess = await refreshAccessState();
    if (!hasAccess) return;

    const storedEnabled = await storageGet("enabled", true);
    isEnabled = storedEnabled !== false && storedEnabled !== "false";

    installConsoleHelper();
    applyCurrentPageBehavior();
    pushStatusUpdate();
  } catch (err) {
    reportAddonBroken(err);
  }
}

void bootstrap();
