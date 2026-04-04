import { CORE_EVENT, CORE_ACTION_TIMEOUT_MS, PING_TIMEOUT_MS } from "./constants.js";

function randomId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createCoreBridge(addonId) {
  function dispatchCoreCommand(type, payload = {}) {
    window.dispatchEvent(new CustomEvent(CORE_EVENT, { detail: { type, ...payload } }));
  }

  function waitForCorePing(timeoutMs = PING_TIMEOUT_MS) {
    return new Promise((resolve) => {
      const replyEvent = randomId("f95ue-addon-ping");
      let settled = false;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener(replyEvent, onReply);
        console.info(`[${addonId}] Ping finished:`, result);
        resolve(result);
      };

      const onReply = (e) => {
        console.info(`[${addonId}] Received ping reply from core:`, e?.detail);
        finish({ ok: Boolean(e?.detail?.ok), apiVersion: String(e?.detail?.apiVersion || "") });
      };

      const timer = setTimeout(() => finish({ ok: false, apiVersion: "" }), timeoutMs);
      window.addEventListener(replyEvent, onReply);
      dispatchCoreCommand("ping", { replyEvent });
    });
  }

  function invokeCoreAction(action, payload = {}, timeoutMs = CORE_ACTION_TIMEOUT_MS) {
    return new Promise((resolve) => {
      const replyEvent = randomId("f95ue-addon-core-action");
      let settled = false;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener(replyEvent, onReply);
        resolve(result);
      };

      const onReply = (e) => finish(e?.detail || { ok: false, reason: "empty_reply" });
      const timer = setTimeout(() => finish({ ok: false, reason: "timeout" }), timeoutMs);

      window.addEventListener(replyEvent, onReply);
      dispatchCoreCommand("core-action", { addonId, action, payload, replyEvent });
    });
  }

  return {
    dispatchCoreCommand,
    waitForCorePing,
    invokeCoreAction,
  };
}
