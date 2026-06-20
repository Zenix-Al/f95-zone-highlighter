import { ensurePageBridge } from "../../core/pageBridge.js";

const CORE_ACTION_RATE_WINDOW_MS = 5000;
const CORE_ACTION_RATE_MAX = 100;
const CORE_ACTION_MAX_CONCURRENT = 12;
const STATUS_UPDATE_RATE_WINDOW_MS = 5000;
const STATUS_UPDATE_RATE_MAX = 10;
const REGISTER_RATE_WINDOW_MS = 30000;
const REGISTER_RATE_MAX = 5;
const UNREGISTER_RATE_WINDOW_MS = 10000;
const UNREGISTER_RATE_MAX = 5;
const UNTHROTTLED_CLEANUP_ACTIONS = new Set([
  "observer.unwatch",
  "ui.dialog.close",
  "ui.dock.removeButtons",
  "ui.style.unregister",
  "ui.unmount",
]);

const addonActionTimestamps = new Map();
const addonInflight = new Map();
const addonStatusTimestamps = new Map();
const addonRegisterTimestamps = new Map();
const addonUnregisterTimestamps = new Map();

function checkRateLimit(map, key, windowMs, maxCount) {
  const now = Date.now();
  let timestamps = map.get(key);
  if (!timestamps) {
    timestamps = [];
    map.set(key, timestamps);
  }
  const cutoff = now - windowMs;
  let i = 0;
  while (i < timestamps.length && timestamps[i] <= cutoff) i++;
  if (i > 0) timestamps.splice(0, i);
  if (timestamps.length >= maxCount) return false;
  timestamps.push(now);
  return true;
}

function tryAcquireInflight(addonId, maxConcurrent = CORE_ACTION_MAX_CONCURRENT) {
  const count = addonInflight.get(addonId) || 0;
  if (count >= maxConcurrent) return false;
  addonInflight.set(addonId, count + 1);
  return true;
}

function releaseInflight(addonId) {
  addonInflight.set(addonId, Math.max(0, (addonInflight.get(addonId) || 0) - 1));
}

let isBridgeListenerBound = false;

function createBridgeScript(devCommandEvent, apiVersion) {
  return `
    (() => {
      if (window.__F95UE_ADDONS_DEV__) return;

      const dispatch = (type, payload = {}) => {
        window.dispatchEvent(
          new CustomEvent("${devCommandEvent}", {
            detail: { type, ...payload },
          }),
        );
      };

      window.__F95UE_ADDONS_DEV__ = {
        apiVersion: "${apiVersion}",
        register(addon) {
          dispatch("register", { addon });
        },
        unregister(addonId) {
          dispatch("unregister", { addonId });
        },
        updateStatus(addonId, status, statusMessage = "") {
          dispatch("update-status", { addonId, status, statusMessage });
        },
        invokeCoreAction(addonId, action, payload = {}, replyEvent = "") {
          dispatch("core-action", { addonId, action, payload, replyEvent });
        },
        teardownComplete(addonId, reason = "") {
          dispatch("teardown-complete", { addonId, reason });
        },
        registerDemo() {
          dispatch("register", {
            addon: {
              id: "console-demo-addon",
              name: "Console Demo Add-in",
              version: "0.1.0",
              description: "A temporary add-in registered directly from the browser console for UI testing.",
              status: "installed",
              statusMessage: "Registered from the browser console.",
              panelTitle: "Console Demo Add-in",
              panelBody:
                "This panel was created through window.__F95UE_ADDONS_DEV__.registerDemo(). You can also call register({...}) manually with your own id, name, status, description, and panelBody.",
              panelToastLabel: "Trigger Main Toast",
              panelToastMessage: "Toast fired from Console Demo Add-in via main script.",
              capabilities: ["toast", "storage", "observer"],
            },
          });
        },
      };
    })();
  `;
}

export function initAddonsBridgeServer({
  marker,
  devCommandEvent,
  apiVersion,
  isServiceDisabled,
  getCoreActionThrottleConfig,
  onRegister,
  onUnregister,
  onUpdateStatus,
  onTeardownComplete,
  onInvokeCoreAction,
}) {
  if (!isBridgeListenerBound) {
    window.addEventListener(devCommandEvent, (event) => {
      const detail = event?.detail || {};
      const type = String(detail.type || "").trim();
        typeBridgeListener(
          type,
          detail,
          apiVersion,
          isServiceDisabled,
          getCoreActionThrottleConfig,
          onRegister,
          onUnregister,
          onUpdateStatus,
        onTeardownComplete,
        onInvokeCoreAction,
      );
    });

    isBridgeListenerBound = true;
  }

  return ensurePageBridge({
    marker,
    scriptContent: createBridgeScript(devCommandEvent, apiVersion),
  });
}

function typeBridgeListener(
  type,
  detail = {},
  apiVersion,
  isServiceDisabled,
  getCoreActionThrottleConfig,
  onRegister,
  onUnregister,
  onUpdateStatus,
  onTeardownComplete,
  onInvokeCoreAction,
) {
  const serviceDisabled = typeof isServiceDisabled === "function" ? Boolean(isServiceDisabled()) : false;
  if (serviceDisabled) {
    if (type === "ping") {
      const replyEvent = String(detail.replyEvent || "").trim();
      if (!replyEvent) return;
      window.dispatchEvent(
        new CustomEvent(replyEvent, {
          detail: { ok: false, reason: "addons_service_disabled", apiVersion },
        }),
      );
      return;
    }

    if (type === "core-action") {
      const replyEvent = String(detail.replyEvent || "").trim();
      if (!replyEvent) return;
      window.dispatchEvent(
        new CustomEvent(replyEvent, {
          detail: { ok: false, reason: "addons_service_disabled" },
        }),
      );
      return;
    }

    if (type === "teardown-complete") {
      onTeardownComplete?.(detail.addonId, detail.reason || "");
    }

    return;
  }

  let key = "";
  if (type === "register") {
    key = String(detail.addon?.id || "").trim();
    if (!key) return;
  } else if (type !== "ping") {
    key = String(detail.addonId || "").trim();
    if (!key) return;
  }

  switch (type) {
    case "ping": {
      const replyEvent = String(detail.replyEvent || "").trim();
      if (!replyEvent) return;
      window.dispatchEvent(
        new CustomEvent(replyEvent, {
          detail: {
            ok: true,
            apiVersion,
          },
        }),
      );
      break;
    }
    case "register": {
      if (
        !checkRateLimit(addonRegisterTimestamps, key, REGISTER_RATE_WINDOW_MS, REGISTER_RATE_MAX)
      ) {
        return;
      }
      onRegister?.(detail.addon || {});
      break;
    }
    case "unregister": {
      if (
        !checkRateLimit(
          addonUnregisterTimestamps,
          key,
          UNREGISTER_RATE_WINDOW_MS,
          UNREGISTER_RATE_MAX,
        )
      ) {
        return;
      }
      onUnregister?.(detail.addonId);
      break;
    }
    case "update-status": {
      if (
        !checkRateLimit(
          addonStatusTimestamps,
          key,
          STATUS_UPDATE_RATE_WINDOW_MS,
          STATUS_UPDATE_RATE_MAX,
        )
      ) {
        return;
      }
      onUpdateStatus?.(detail.addonId, detail.status, detail.statusMessage || "");
      break;
    }
    case "teardown-complete": {
      onTeardownComplete?.(detail.addonId, detail.reason || "");
      break;
    }
    case "core-action": {
      const throttleConfig =
        typeof getCoreActionThrottleConfig === "function"
          ? getCoreActionThrottleConfig()
          : {
              windowMs: CORE_ACTION_RATE_WINDOW_MS,
              maxCount: CORE_ACTION_RATE_MAX,
              maxConcurrent: CORE_ACTION_MAX_CONCURRENT,
            };
      const replyEvent = String(detail.replyEvent || "").trim();
      if (!replyEvent) return;
      const action = String(detail.action || "").trim();
      const isCleanupAction = UNTHROTTLED_CLEANUP_ACTIONS.has(action);
      if (
        !isCleanupAction &&
        !checkRateLimit(
          addonActionTimestamps,
          key,
          throttleConfig.windowMs,
          throttleConfig.maxCount,
        )
      ) {
        window.dispatchEvent(
          new CustomEvent(replyEvent, { detail: { ok: false, reason: "rate_limited" } }),
        );
        return;
      }
      if (!isCleanupAction && !tryAcquireInflight(key, throttleConfig.maxConcurrent)) {
        window.dispatchEvent(
          new CustomEvent(replyEvent, {
            detail: { ok: false, reason: "too_many_concurrent_requests" },
          }),
        );
        return;
      }
      Promise.resolve(
        onInvokeCoreAction?.(key, action, detail.payload || {}) || {
          ok: false,
          reason: "unsupported_action",
        },
      )
        .then((result) => {
          if (!isCleanupAction) releaseInflight(key);
          window.dispatchEvent(new CustomEvent(replyEvent, { detail: result }));
        })
        .catch(() => {
          if (!isCleanupAction) releaseInflight(key);
          window.dispatchEvent(
            new CustomEvent(replyEvent, { detail: { ok: false, reason: "internal_error" } }),
          );
        });
      break;
    }
  }
}
