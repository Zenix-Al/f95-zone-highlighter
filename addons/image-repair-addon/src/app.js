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
import { createRetryManager } from "./feature.js";
import { debugLog } from "../../shared/debugLog.js";

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

async function waitForPageReady() {
  // Wait for document.readyState to be complete
  if (document.readyState !== "complete") {
    await new Promise((resolve) => {
      window.addEventListener("load", resolve, { once: true });
    });
  }

  // Also wait for F95Zone's loading overlay to disappear (if present)
  // F95Zone shows a loading indicator during navigation
  const checkLoadingOverlay = () => {
    const overlay = document.querySelector(
      "[data-loading='true'], .page-loading, .overlay-loading",
    );
    return !overlay || overlay.style.display === "none" || overlay.style.opacity === "0";
  };

  if (!checkLoadingOverlay()) {
    await new Promise((resolve) => {
      const maxWait = 10000; // Max 10 seconds
      const startTime = Date.now();
      const checkInterval = setInterval(() => {
        if (checkLoadingOverlay() || Date.now() - startTime > maxWait) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  debugLog("Image Repair", "Page is fully ready for image observation.");
}

export function startImageRepairAddon() {
  debugLog("Image Repair Add-on initializing...");
  const runtime = getRuntimeConfig();
  const bridge = createCoreBridge(runtime.addonId);
  const observerId = "image-repair-direct-observer";

  let isEnabled = true;
  let isObserverWatching = false;
  let addonCommandHandlerBound = false;
  let addonCommandHandler = null;
  const metrics = { succeeded: 0, failed: 0, avgCache: 0 };

  const ui = createImageRepairUi({
    addonId: runtime.addonId,
    toastId: "img-retry-toast",
    wrapperId: "image-retry-toast-wrapper",
    toastUpdateInterval: TOAST_UPDATE_INTERVAL,
    metrics,
  });

  async function registerUiStyle() {
    const result = await bridge.invokeCoreAction("ui.style.register", {
      styleId: ui.styleId,
      cssText: ui.cssText,
    });
    return Boolean(result?.ok);
  }

  async function unregisterUiStyle() {
    await bridge.invokeCoreAction("ui.style.unregister", {
      styleId: ui.styleId,
    });
  }

  const feature = createRetryManager({
    imageHost: IMAGE_HOST,
    retryDelay: RETRY_DELAY,
    maxAttempts: MAX_ATTEMPTS,
    isEnabled: () => isEnabled,
    recordSuccess: (duration) => {
      metrics.succeeded += 1;
      metrics.avgCache =
        (metrics.avgCache * (metrics.succeeded - 1) + duration) / metrics.succeeded;
    },
    recordFail: () => {
      metrics.failed += 1;
    },
    notifyAllDone: () => {
      notify("Images Reloaded", "All images have finished reloading.");
    },
    notifyMaxAttempts: (maxAttemptsValue) => {
      notify(
        "Reload Warning",
        `Some images failed to reload after ${maxAttemptsValue} attempts. You may need to refresh.`,
      );
    },
    ui,
  });
  async function toggleObserver(enabled) {
    if (enabled) {
      await bridge.invokeCoreAction("observer.watch", { observerId, srcPrefix: IMAGE_HOST });
    } else {
      await bridge.invokeCoreAction("observer.unwatch", { observerId });
    }
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
        name: runtime.addonName,
        version: runtime.addonVersion,
        description: runtime.addonDescription,
        status: isEnabled ? "installed" : "disabled",
        statusMessage: statusMessage(),
        panelTitle: runtime.addonName,
        panelBody:
          "Retries failed attachment images (attachments.f95zone.to). Use Enable / Disable to control whether the watcher is active.",
        capabilities: runtime.capabilities,
        pageScopes: ["thread"],
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

  async function setEnabled(nextEnabled) {
    isEnabled = Boolean(nextEnabled);
    await storageSet("enabled", isEnabled);

    if (isEnabled) {
      await registerUiStyle();
      feature.enable();
      await toggleObserver(true);
      debugLog(runtime.addonId, "Add-on enabled via command.", { data: { nextEnabled } });
    } else {
      feature.disable();
      await toggleObserver(false);
      await unregisterUiStyle();
      debugLog(runtime.addonId, "Add-on disabled via command.", { data: { nextEnabled } });
    }

    pushStatusUpdate();
  }

  function unbindAddonCommandListener() {
    if (!addonCommandHandlerBound || !addonCommandHandler) return;
    window.removeEventListener(ADDON_COMMAND_EVENT, addonCommandHandler);
    addonCommandHandlerBound = false;
    addonCommandHandler = null;
  }

  async function teardownAddon(reason = "teardown") {
    feature.disable();
    await toggleObserver(false);
    await unregisterUiStyle();
    unbindAddonCommandListener();
    bridge.dispatchCoreCommand("teardown-complete", {
      addonId: runtime.addonId,
      reason,
    });
  }

  function bindAddonCommandListener() {
    if (addonCommandHandlerBound) return;
    addonCommandHandler = (event) => {
      const detail = event?.detail || {};
      if (String(detail.addonId || "") !== runtime.addonId) return;

      const command = String(detail.command || "").trim();
      if (command === "enable") {
        void setEnabled(true);
      } else if (command === "disable") {
        void setEnabled(false);
      } else if (command === "teardown") {
        void teardownAddon(String(detail.reason || "teardown"));
      } else if (command === "observer.nodes") {
        if (String(detail.observerId || "") !== observerId) return;
        feature.enqueueObservedNodes(detail.nodes || []);
      }
    };
    window.addEventListener(ADDON_COMMAND_EVENT, addonCommandHandler);
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
    debugLog(runtime.addonId, "Bootstrapping add-on...");
    const ping = await bridge.waitForCorePing();
    if (!ping.ok && runtime.requiresCore) {
      debugLog(runtime.addonId, "F95UE core not detected; add-on skipped.", { data: { ping } });
      return;
    }
    debugLog(runtime.addonId, "F95UE core detected and responsive.", { data: { ping } });
    // Register first so permission-checked storage actions can resolve this add-on.
    registerAddon();
    debugLog(runtime.addonId, "Add-on registered with core.", { data: { ping } });
    try {
      const stored = await storageGet("enabled", true);
      isEnabled = stored !== false && stored !== "false";

      bindAddonCommandListener();

      if (isEnabled) {
        // Wait for page to fully load before enabling observer
        await waitForPageReady();

        await registerUiStyle();
        feature.enable();
        await toggleObserver(true);
        debugLog(runtime.addonId, "Add-on initialized and enabled.", { data: { stored } });
      } else {
        await toggleObserver(false);
        await unregisterUiStyle();
        // Sync panel status after applying persisted disabled state.
        pushStatusUpdate();
        debugLog(runtime.addonId, "Add-on initialized but disabled (per stored setting).", {
          data: { stored },
        });
      }

      installConsoleHelper();
    } catch (err) {
      reportAddonBroken(err);
    }
  }

  void bootstrap();
}
