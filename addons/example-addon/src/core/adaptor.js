const CORE_EVENT = "f95ue:addons-dev-command";
const ADDON_COMMAND_EVENT = "f95ue:addon-command";
const PING_TIMEOUT_MS = 1500;
const CORE_ACTION_TIMEOUT_MS = 2500;

function randomId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createCoreAdaptor(addonId) {
  function dispatchCoreCommand(type, payload = {}) {
    window.dispatchEvent(new CustomEvent(CORE_EVENT, { detail: { type, ...payload } }));
  }

  function waitForCorePing(timeoutMs = PING_TIMEOUT_MS) {
    return new Promise((resolve) => {
      const replyEvent = randomId("f95ue-example-addon-ping");
      let settled = false;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener(replyEvent, onReply);
        resolve(result);
      };

      const onReply = (event) => {
        finish({
          ok: Boolean(event?.detail?.ok),
          apiVersion: String(event?.detail?.apiVersion || ""),
        });
      };

      const timer = setTimeout(() => finish({ ok: false, apiVersion: "" }), timeoutMs);
      window.addEventListener(replyEvent, onReply);
      dispatchCoreCommand("ping", { replyEvent });
    });
  }

  function invokeCoreAction(action, payload = {}, timeoutMs = CORE_ACTION_TIMEOUT_MS) {
    return new Promise((resolve) => {
      const replyEvent = randomId("f95ue-example-addon-core-action");
      let settled = false;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener(replyEvent, onReply);
        resolve(result);
      };

      const onReply = (event) => finish(event?.detail || { ok: false, reason: "empty_reply" });
      const timer = setTimeout(() => finish({ ok: false, reason: "timeout" }), timeoutMs);

      window.addEventListener(replyEvent, onReply);
      dispatchCoreCommand("core-action", { addonId, action, payload, replyEvent });
    });
  }

  function registerAddon(addon) {
    dispatchCoreCommand("register", { addon });
  }

  function updateStatus(status, statusMessage = "") {
    dispatchCoreCommand("update-status", { addonId, status, statusMessage });
  }

  function notifyTeardownComplete(reason = "") {
    dispatchCoreCommand("teardown-complete", { addonId, reason });
  }

  function bindAddonCommands(handler) {
    if (typeof handler !== "function") return () => {};

    const listener = (event) => {
      const detail = event?.detail || {};
      if (String(detail.addonId || "").trim() !== addonId) return;
      handler(detail);
    };

    window.addEventListener(ADDON_COMMAND_EVENT, listener);
    return () => {
      window.removeEventListener(ADDON_COMMAND_EVENT, listener);
    };
  }

  return {
    bindAddonCommands,
    invokeCoreAction,
    notifyTeardownComplete,
    registerAddon,
    updateStatus,
    waitForCorePing,
  };
}
