import { ensurePageBridge } from "../../core/pageBridge.js";

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

      if (type === "ping") {
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
        return;
      }

      if (type === "register") {
        onRegister?.(detail.addon || {});
        return;
      }

      if (type === "unregister") {
        onUnregister?.(detail.addonId);
        return;
      }

      if (type === "update-status") {
        onUpdateStatus?.(detail.addonId, detail.status, detail.statusMessage || "");
        return;
      }

      if (type === "teardown-complete") {
        onTeardownComplete?.(detail.addonId, detail.reason || "");
        return;
      }

      if (type === "core-action") {
        const replyEvent = String(detail.replyEvent || "").trim();
        Promise.resolve(
          onInvokeCoreAction?.(detail.addonId, detail.action, detail.payload || {}) || {
            ok: false,
            reason: "unsupported_action",
          },
        ).then((result) => {
          if (replyEvent) {
            window.dispatchEvent(new CustomEvent(replyEvent, { detail: result }));
          }
        });
      }
    });

    isBridgeListenerBound = true;
  }

  return ensurePageBridge({
    marker,
    scriptContent: createBridgeScript(devCommandEvent, apiVersion),
  });
}
