import {
  ADDON_COMMAND_EVENT,
  getRuntimeConfig,
  IMAGE_HOST,
  MAX_ATTEMPTS,
  QUEUE_DELAY,
  RETRY_DELAY,
  TOAST_UPDATE_INTERVAL,
} from "./constants.js";
import { createCoreBridge } from "./coreBridge.js";
import { createImageRepairUi } from "./ui.js";
import { createImageRepairFeature } from "./feature.js";

function notify(title, body) {
  if (!("Notification" in window)) return;

  if (Notification.permission === "granted") {
    new Notification(title, { body });
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        new Notification(title, { body });
      }
    });
  }
}

function createStatusMessages() {
  return {
    enabled: "Watching for broken images and retrying automatically.",
    disabled: "Image repair is currently disabled.",
  };
}

export function startImageRepairAddon() {
  const runtime = getRuntimeConfig();
  const bridge = createCoreBridge(runtime.addonId);
  const observerId = "image-repair-direct-observer";

  let isEnabled = true;
  let isObserverWatching = false;
  let addonCommandHandlerBound = false;
  const metrics = { succeeded: 0, failed: 0, avgCache: 0 };

  const ui = createImageRepairUi({
    addonId: runtime.addonId,
    toastId: "img-retry-toast",
    wrapperId: "image-retry-toast-wrapper",
    toastUpdateInterval: TOAST_UPDATE_INTERVAL,
    metrics,
  });

  const feature = createImageRepairFeature({
    imageHost: IMAGE_HOST,
    queueDelay: QUEUE_DELAY,
    retryDelay: RETRY_DELAY,
    maxAttempts: MAX_ATTEMPTS,
    isEnabled: () => isEnabled,
    recordSuccess(duration) {
      metrics.succeeded += 1;
      metrics.avgCache =
        (metrics.avgCache * (metrics.succeeded - 1) + duration) / metrics.succeeded;
    },
    recordFail() {
      metrics.failed += 1;
    },
    notifyAllDone() {
      notify("Images Reloaded", "All images have finished reloading.");
    },
    notifyMaxAttempts(maxAttemptsValue) {
      notify(
        "Reload Warning",
        `Some images failed to reload after ${maxAttemptsValue} attempts. You may need to refresh.`,
      );
    },
    ui,
  });

  async function startDirectObserver() {
    if (isObserverWatching) return;
    const result = await bridge.invokeCoreAction("observer.watch", {
      observerId,
      srcPrefix: IMAGE_HOST,
    });
    isObserverWatching = Boolean(result?.ok);
  }

  async function stopDirectObserver() {
    if (!isObserverWatching) return;
    await bridge.invokeCoreAction("observer.unwatch", { observerId });
    isObserverWatching = false;
  }

  async function storageGet(key, defaultValue = null) {
    const result = await bridge.invokeCoreAction("storage.get", { key, defaultValue });
    return result.ok ? result.value : defaultValue;
  }

  function storageSet(key, value) {
    return bridge.invokeCoreAction("storage.set", { key, value });
  }

  function statusMessage() {
    const msg = createStatusMessages();
    return isEnabled ? msg.enabled : msg.disabled;
  }

  function registerAddon() {
    bridge.dispatchCoreCommand("register", {
      addon: {
        id: runtime.addonId,
        name: "Image Repair Add-on",
        version: "0.1.0",
        description:
          "Automatically retries broken attachment images on F95Zone threads. Runs alongside F95UE core.",
        status: isEnabled ? "installed" : "disabled",
        statusMessage: statusMessage(),
        panelTitle: "Image Repair Add-on",
        panelBody:
          "Retries failed attachment images (attachments.f95zone.to). Use Enable / Disable to control whether the watcher is active.",
        capabilities: runtime.capabilities,
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

  function setEnabled(nextEnabled) {
    isEnabled = Boolean(nextEnabled);
    void storageSet("enabled", isEnabled);

    if (isEnabled) {
      feature.enable();
      void startDirectObserver();
    } else {
      feature.disable();
      void stopDirectObserver();
    }

    pushStatusUpdate();
  }

  function bindAddonCommandListener() {
    if (addonCommandHandlerBound) return;
    window.addEventListener(ADDON_COMMAND_EVENT, (event) => {
      const detail = event?.detail || {};
      if (String(detail.addonId || "") !== runtime.addonId) return;

      const command = String(detail.command || "").trim();
      if (command === "enable") {
        setEnabled(true);
      } else if (command === "disable") {
        setEnabled(false);
      } else if (command === "observer.nodes") {
        if (String(detail.observerId || "") !== observerId) return;
        feature.enqueueObservedNodes(detail.nodes || []);
      }
    });
    addonCommandHandlerBound = true;
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

  function installConsoleHelper() {
    window.__F95UE_IMAGE_REPAIR_ADDON__ = {
      enable() {
        setEnabled(true);
      },
      disable() {
        setEnabled(false);
      },
      getMetrics() {
        return { succeeded: metrics.succeeded, failed: metrics.failed, avg: metrics.avgCache };
      },
      unregister() {
        feature.disable();
        bridge.dispatchCoreCommand("unregister", { addonId: runtime.addonId });
      },
      pingCore() {
        return bridge.waitForCorePing();
      },
      triggerToast(msg) {
        return bridge.invokeCoreAction("toast.show", {
          message: msg || "Image Repair add-on test toast",
        });
      },
    };
  }

  async function bootstrap() {
    const ping = await bridge.waitForCorePing();
    if (!ping.ok && runtime.requiresCore) {
      console.info(`[${runtime.addonId}] F95UE core not detected; add-on skipped.`);
      console.info(`ping status: ${JSON.stringify(ping)}, `);
      return;
    }

    // Register first so permission-checked storage actions can resolve this add-on.
    registerAddon();

    try {
      const stored = await storageGet("enabled", true);
      isEnabled = stored !== false && stored !== "false";

      bindAddonCommandListener();

      if (isEnabled) {
        feature.enable();
        await startDirectObserver();
      } else {
        await stopDirectObserver();
        // Sync panel status after applying persisted disabled state.
        pushStatusUpdate();
      }

      installConsoleHelper();
    } catch (err) {
      reportAddonBroken(err);
    }
  }

  void bootstrap();
}
