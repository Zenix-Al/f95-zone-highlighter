const CORE_EVENT = "f95ue:addons-dev-command";
const ADDON_COMMAND_EVENT = "f95ue:addon-command";
const CORE_PROTOCOL_VERSION = "0.1.0";
const CORE_MARKER = "f95ue_addons_dev_bridge_installed";
const PING_TIMEOUT_MS = 1500;
const CORE_ACTION_TIMEOUT_MS = 2500;

function randomId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Shared handshake and API adapter for every core-connected add-on. */
export function createCoreBridge(addonId) {
  const normalizedAddonId = String(addonId || "").trim();

  function dispatchCoreCommand(type, payload = {}) {
    window.dispatchEvent(new CustomEvent(CORE_EVENT, { detail: { type, ...payload } }));
  }

  function waitForCorePing(timeoutMs = PING_TIMEOUT_MS) {
    return new Promise((resolve) => {
      const replyEvent = randomId(`f95ue-${normalizedAddonId || "addon"}-ping`);
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener(replyEvent, onReply);
        resolve(result);
      };
      const onReply = (event) => {
        const detail = event?.detail || {};
        finish({ ok: Boolean(detail.ok), apiVersion: String(detail.apiVersion || "") });
      };
      const timer = window.setTimeout(() => finish({ ok: false, apiVersion: "" }), timeoutMs);
      window.addEventListener(replyEvent, onReply);
      dispatchCoreCommand("ping", { replyEvent });
    });
  }

  function invokeCoreAction(action, payload = {}, timeoutMs = CORE_ACTION_TIMEOUT_MS) {
    return new Promise((resolve) => {
      const replyEvent = randomId(`f95ue-${normalizedAddonId || "addon"}-core-action`);
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener(replyEvent, onReply);
        resolve(result);
      };
      const onReply = (event) => finish(event?.detail || { ok: false, reason: "empty_reply" });
      const timer = window.setTimeout(() => finish({ ok: false, reason: "timeout" }), timeoutMs);
      window.addEventListener(replyEvent, onReply);
      dispatchCoreCommand("core-action", {
        marker: CORE_MARKER,
        protocolVersion: CORE_PROTOCOL_VERSION,
        requestId: randomId(`f95ue-${normalizedAddonId || "addon"}-request`),
        addonId: normalizedAddonId,
        action,
        payload,
        replyEvent,
      });
    });
  }

  function bindAddonCommands(handler) {
    if (typeof handler !== "function") return () => {};
    const listener = (event) => {
      const detail = event?.detail || {};
      if (String(detail.addonId || "").trim() !== normalizedAddonId) return;
      handler(detail);
    };
    window.addEventListener(ADDON_COMMAND_EVENT, listener);
    return () => window.removeEventListener(ADDON_COMMAND_EVENT, listener);
  }

  function registerAddon(addon) {
    dispatchCoreCommand("register", { addon });
  }

  function updateStatus(status, statusMessage = "") {
    dispatchCoreCommand("update-status", { addonId: normalizedAddonId, status, statusMessage });
  }

  function teardownComplete(reason = "") {
    dispatchCoreCommand("teardown-complete", {
      addonId: normalizedAddonId,
      reason: String(reason || ""),
    });
  }

  return {
    bindAddonCommands,
    dispatchCoreCommand,
    getAddonAccess: () => invokeCoreAction("addon.access", {}),
    getCoreThrottle: () => invokeCoreAction("addon.throttle", {}),
    invokeCoreAction,
    notifyTeardownComplete: teardownComplete,
    registerAddon,
    teardownComplete,
    updateStatus,
    waitForCorePing,
  };
}
