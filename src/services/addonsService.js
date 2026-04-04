import { ensurePageBridge } from "../core/pageBridge.js";
import stateManager from "../config.js";
import { showToast } from "../ui/components/toast.js";
import {
  ADDON_COMMAND_EVENT,
  ADDONS_API_VERSION,
  ADDONS_DEV_BRIDGE_MARKER,
  ADDONS_DEV_COMMAND_EVENT,
  sanitizeAddonId,
} from "./addons/shared.js";
import {
  listRegisteredAddons,
  registerAddon,
  reapplyAddonSecurityPolicies,
  replaceRegisteredAddons,
  subscribeAddonsRegistry,
  unregisterAddon as unregisterAddonFromRegistry,
  updateAddonStatus,
} from "./addons/registry.js";
import {
  clearAddonState,
  ensureAddonStateBucket,
  getAddonState,
  listInstalledAddonMeta,
  persistAddonsState,
  setAddonStateValue,
} from "./addons/state.js";
import { listTrustedAddonCatalog } from "./addons/catalog.js";
import {
  cleanupAddonObserverSubscriptions,
  unwatchAddonObserver,
  watchAddonObserver,
} from "./addons/observer.js";
import {
  idbBulkPutForAddon,
  idbCountForAddon,
  idbDeleteForAddon,
  idbGetForAddon,
  idbPutForAddon,
  idbQueryForAddon,
} from "./addons/idbStore.js";

let isConsoleBridgeBound = false;
const MAX_ADDON_IDB_PAYLOAD_BYTES = 512 * 1024;
const MAX_ADDON_IDB_BULK_ITEMS = 500;
const ADDON_DOCK_SLOT_ID = "f95ue-page-dock-addon-slot";
const addonDockButtonsState = new Map();
let addonDockFlushTimer = 0;

export { listRegisteredAddons, replaceRegisteredAddons, registerAddon, subscribeAddonsRegistry };
export { getAddonState, setAddonStateValue, clearAddonState };

function sanitizeDockButtons(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      const id = String(entry?.id || "").trim();
      const label = String(entry?.label || "").trim();
      if (!id || !label) return null;

      const variant = String(entry?.variant || "primary")
        .trim()
        .toLowerCase();

      return {
        id,
        label,
        title: String(entry?.title || "").trim(),
        disabled: Boolean(entry?.disabled),
        variant:
          variant === "secondary" || variant === "saved" || variant === "primary"
            ? variant
            : "primary",
      };
    })
    .filter(Boolean)
    .slice(0, 4);
}

function getDockSlotElement() {
  const shadowRoot = stateManager.get("shadowRoot");
  if (!shadowRoot?.getElementById) return null;
  return shadowRoot.getElementById(ADDON_DOCK_SLOT_ID);
}

function buildDockGroupId(addonId) {
  return `f95ue-addon-dock-${String(addonId || "")}`;
}

function removeAddonDockGroup(addonId) {
  const slot = getDockSlotElement();
  if (!slot) return;
  const group = slot.querySelector(`#${buildDockGroupId(addonId)}`);
  if (group?.parentNode) {
    group.parentNode.removeChild(group);
  }
}

function renderAddonDockGroup(addonId, buttons) {
  const slot = getDockSlotElement();
  if (!slot) return false;

  const groupId = buildDockGroupId(addonId);
  let group = slot.querySelector(`#${groupId}`);
  if (!group) {
    group = document.createElement("div");
    group.id = groupId;
    group.className = "f95ue-page-dock-group";
    group.dataset.addonId = addonId;
    slot.appendChild(group);
  }

  group.innerHTML = "";

  buttons.forEach((entry) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "f95ue-page-dock-btn";
    if (entry.variant === "secondary") {
      button.classList.add("secondary");
    } else if (entry.variant === "saved") {
      button.classList.add("saved");
    }
    button.disabled = Boolean(entry.disabled);
    button.dataset.addonId = addonId;
    button.dataset.actionId = entry.id;
    button.textContent = entry.label;
    if (entry.title) {
      button.title = entry.title;
    }

    button.addEventListener("click", () => {
      window.dispatchEvent(
        new CustomEvent(ADDON_COMMAND_EVENT, {
          detail: {
            addonId,
            command: "dock-action",
            actionId: entry.id,
          },
        }),
      );
    });

    group.appendChild(button);
  });

  return true;
}

function flushAddonDockButtons() {
  const slot = getDockSlotElement();
  if (!slot) return false;

  addonDockButtonsState.forEach((buttons, addonId) => {
    if (!Array.isArray(buttons) || buttons.length === 0) {
      removeAddonDockGroup(addonId);
      return;
    }
    renderAddonDockGroup(addonId, buttons);
  });

  return true;
}

function scheduleAddonDockFlush() {
  if (addonDockFlushTimer) return;

  let remainingAttempts = 40;
  const tick = () => {
    addonDockFlushTimer = 0;

    if (flushAddonDockButtons()) {
      return;
    }

    remainingAttempts -= 1;
    if (remainingAttempts <= 0) return;
    addonDockFlushTimer = window.setTimeout(tick, 250);
  };

  addonDockFlushTimer = window.setTimeout(tick, 0);
}

function getCurrentPageScopes() {
  const scopes = [];
  if (stateManager.get("isThread")) scopes.push("thread");
  if (stateManager.get("isLatest")) scopes.push("latest");
  if (stateManager.get("isDownloadPage")) scopes.push("download");
  if (stateManager.get("isRecaptchaFrame")) scopes.push("recaptcha");
  return scopes;
}

function supportsCurrentPage(pageScopes = [], currentScopes = []) {
  if (!Array.isArray(pageScopes) || pageScopes.length === 0) return true;
  return pageScopes.some((scope) => currentScopes.includes(scope));
}

export function listKnownAddons() {
  const registered = listRegisteredAddons();
  const byRegistered = new Map(registered.map((addon) => [addon.id, addon]));
  const catalog = listTrustedAddonCatalog();
  const installedMeta = listInstalledAddonMeta();
  const currentScopes = getCurrentPageScopes();

  const catalogIds = new Set(catalog.map((entry) => entry.id));
  const allIds = new Set([
    ...catalog.map((entry) => entry.id),
    ...Object.keys(installedMeta),
    ...registered.map((entry) => entry.id),
  ]);

  const merged = [];
  for (const id of allIds) {
    const runtimeEntry = byRegistered.get(id) || null;
    const catalogEntry = catalog.find((entry) => entry.id === id) || null;
    const metaEntry = installedMeta[id] || null;

    const pageScopes = Array.isArray(catalogEntry?.pageScopes) ? [...catalogEntry.pageScopes] : [];
    const scopeApplies = supportsCurrentPage(pageScopes, currentScopes);
    const hasInstallSighting = Boolean(metaEntry?.installedSeenAt);

    let status = runtimeEntry?.status || "disabled";
    let statusMessage = runtimeEntry?.statusMessage || "";

    if (!runtimeEntry && hasInstallSighting) {
      if (scopeApplies) {
        status = "not-installed";
        statusMessage =
          "Not detected on this supported page. The add-on may be disabled or failed to load.";
      } else {
        status = "installed";
        statusMessage = "Installed. This add-on only activates on supported pages.";
      }
    } else if (!runtimeEntry && !hasInstallSighting) {
      status = "not-installed";
      statusMessage = "Not detected yet. Install using the download button.";
    }

    merged.push({
      id,
      name: runtimeEntry?.name || catalogEntry?.name || metaEntry?.name || "Unknown Add-on",
      version: runtimeEntry?.version || metaEntry?.version || catalogEntry?.version || "0.0.0",
      description:
        runtimeEntry?.description || catalogEntry?.description || "No description provided yet.",
      status,
      statusMessage,
      panelTitle: runtimeEntry?.panelTitle || catalogEntry?.name || runtimeEntry?.name || "Add-on",
      panelBody:
        runtimeEntry?.panelBody ||
        catalogEntry?.description ||
        "This add-on has no runtime panel content on this page.",
      panelToastLabel: runtimeEntry?.panelToastLabel || "",
      panelToastMessage: runtimeEntry?.panelToastMessage || "",
      panelSettingsTitle: runtimeEntry?.panelSettingsTitle || "",
      panelSettingsDescription: runtimeEntry?.panelSettingsDescription || "",
      panelSettingsStorageKey: runtimeEntry?.panelSettingsStorageKey || "",
      panelSettingsDefaults:
        runtimeEntry?.panelSettingsDefaults &&
        typeof runtimeEntry.panelSettingsDefaults === "object"
          ? runtimeEntry.panelSettingsDefaults
          : null,
      panelSettings: Array.isArray(runtimeEntry?.panelSettings) ? runtimeEntry.panelSettings : [],
      panelActions: Array.isArray(runtimeEntry?.panelActions) ? runtimeEntry.panelActions : [],
      capabilities: Array.isArray(runtimeEntry?.capabilities) ? [...runtimeEntry.capabilities] : [],
      trusted: Boolean(runtimeEntry?.trusted || catalogIds.has(id)),
      blocked: Boolean(runtimeEntry?.blocked),
      activeOnPage: Boolean(runtimeEntry),
      supportsCurrentPage: scopeApplies,
      pageScopes,
      downloadUrl: String(catalogEntry?.downloadUrl || "").trim(),
      installedSeenAt: Number(metaEntry?.installedSeenAt || 0),
      lastSeenAt: Number(metaEntry?.lastSeenAt || 0),
    });
  }

  return merged.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export function refreshAddonSecurityPolicies() {
  return reapplyAddonSecurityPolicies();
}

export function unregisterAddon(addonId) {
  const normalizedId = sanitizeAddonId(addonId);
  if (!normalizedId) return listRegisteredAddons();
  cleanupAddonObserverSubscriptions(normalizedId);
  addonDockButtonsState.delete(normalizedId);
  removeAddonDockGroup(normalizedId);
  return unregisterAddonFromRegistry(normalizedId);
}

function measurePayloadBytes(payload) {
  try {
    return JSON.stringify(payload || null).length;
  } catch {
    return MAX_ADDON_IDB_PAYLOAD_BYTES + 1;
  }
}

export async function invokeAddonCoreAction(addonId, action, payload = {}) {
  const normalizedId = sanitizeAddonId(addonId);
  if (!normalizedId) return { ok: false, reason: "invalid_addon_id" };

  const addon = listRegisteredAddons().find((entry) => entry.id === normalizedId);
  if (!addon) return { ok: false, reason: "addon_not_registered" };

  if (action === "addon.access") {
    return {
      ok: true,
      value: {
        blocked: Boolean(addon.blocked),
        trusted: Boolean(addon.trusted),
        capabilities: Array.isArray(addon.capabilities) ? [...addon.capabilities] : [],
      },
    };
  }

  if (addon.blocked) return { ok: false, reason: "addon_blocked" };

  const allowed = new Set(Array.isArray(addon.capabilities) ? addon.capabilities : []);

  if (action === "toast.show") {
    if (!allowed.has("toast")) return { ok: false, reason: "permission_denied" };
    const message = String(payload?.message || "").trim();
    if (!message) return { ok: false, reason: "message_required" };
    showToast(message);
    return { ok: true };
  }

  if (action === "feature.enable" || action === "feature.disable") {
    if (!allowed.has("feature")) return { ok: false, reason: "permission_denied" };

    const enabled = action === "feature.enable";
    const nextStatus = enabled ? "installed" : "disabled";
    const nextMessage = enabled ? "Feature is active." : "Feature is currently disabled.";

    updateAddonStatus(normalizedId, nextStatus, nextMessage);

    const stateBucket = ensureAddonStateBucket(normalizedId);
    stateBucket.enabled = enabled;
    const persisted = await persistAddonsState();

    window.dispatchEvent(
      new CustomEvent(ADDON_COMMAND_EVENT, {
        detail: {
          addonId: normalizedId,
          command: enabled ? "enable" : "disable",
        },
      }),
    );

    if (!persisted.ok) return { ok: false, reason: "storage_error" };
    return { ok: true };
  }

  if (action === "feature.refresh") {
    if (!allowed.has("feature")) return { ok: false, reason: "permission_denied" };
    window.dispatchEvent(
      new CustomEvent(ADDON_COMMAND_EVENT, {
        detail: {
          addonId: normalizedId,
          command: "refresh",
        },
      }),
    );
    return { ok: true };
  }

  if (action === "storage.get") {
    if (!allowed.has("storage")) return { ok: false, reason: "permission_denied" };
    const key = String(payload?.key || "").trim();
    if (!key) return { ok: false, reason: "key_required" };

    const stateBucket = ensureAddonStateBucket(normalizedId);
    if (Object.prototype.hasOwnProperty.call(stateBucket, key)) {
      return { ok: true, value: stateBucket[key] };
    }

    try {
      const legacyValue = await GM.getValue(`addon:${normalizedId}:${key}`, undefined);
      if (typeof legacyValue !== "undefined") {
        stateBucket[key] = legacyValue;
        const persisted = await persistAddonsState();
        if (!persisted.ok) return { ok: false, reason: "storage_error" };
        return { ok: true, value: legacyValue };
      }
      return { ok: true, value: payload?.defaultValue ?? null };
    } catch {
      return { ok: false, reason: "storage_error" };
    }
  }

  if (action === "storage.set") {
    if (!allowed.has("storage")) return { ok: false, reason: "permission_denied" };
    const key = String(payload?.key || "").trim();
    if (!key) return { ok: false, reason: "key_required" };

    const setResult = await setAddonStateValue(normalizedId, key, payload?.value ?? null);
    if (!setResult.ok) return setResult;
    return { ok: true };
  }

  if (
    action === "idb.get" ||
    action === "idb.put" ||
    action === "idb.delete" ||
    action === "idb.bulkPut" ||
    action === "idb.query" ||
    action === "idb.count"
  ) {
    if (!allowed.has("idb")) return { ok: false, reason: "permission_denied" };

    if (measurePayloadBytes(payload) > MAX_ADDON_IDB_PAYLOAD_BYTES) {
      return { ok: false, reason: "payload_too_large" };
    }

    if (action === "idb.bulkPut") {
      const entries = Array.isArray(payload?.entries) ? payload.entries : [];
      if (entries.length > MAX_ADDON_IDB_BULK_ITEMS) {
        return { ok: false, reason: "too_many_items" };
      }
    }

    try {
      if (action === "idb.get") {
        if (!Object.prototype.hasOwnProperty.call(payload || {}, "key")) {
          return { ok: false, reason: "key_required" };
        }
        const value = await idbGetForAddon(normalizedId, payload || {});
        return { ok: true, value: typeof value === "undefined" ? null : value };
      }

      if (action === "idb.put") {
        if (!Object.prototype.hasOwnProperty.call(payload || {}, "value")) {
          return { ok: false, reason: "value_required" };
        }
        const key = await idbPutForAddon(normalizedId, payload || {});
        return { ok: true, value: key };
      }

      if (action === "idb.delete") {
        if (!Object.prototype.hasOwnProperty.call(payload || {}, "key")) {
          return { ok: false, reason: "key_required" };
        }
        await idbDeleteForAddon(normalizedId, payload || {});
        return { ok: true };
      }

      if (action === "idb.bulkPut") {
        const entries = Array.isArray(payload?.entries) ? payload.entries : [];
        await idbBulkPutForAddon(normalizedId, { ...payload, entries });
        return { ok: true, value: entries.length };
      }

      if (action === "idb.query") {
        const rows = await idbQueryForAddon(normalizedId, payload || {});
        return { ok: true, value: rows };
      }

      if (action === "idb.count") {
        const count = await idbCountForAddon(normalizedId, payload || {});
        return { ok: true, value: Number(count || 0) };
      }
    } catch (error) {
      console.warn("[addonsService] idb core-action failed:", error);
      return { ok: false, reason: "idb_error" };
    }
  }

  if (action === "observer.watch") {
    if (!allowed.has("observer")) return { ok: false, reason: "permission_denied" };
    return watchAddonObserver(normalizedId, payload);
  }

  if (action === "observer.unwatch") {
    if (!allowed.has("observer")) return { ok: false, reason: "permission_denied" };
    return unwatchAddonObserver(normalizedId, payload);
  }

  if (action === "ui.dock.setButtons") {
    if (!allowed.has("ui")) return { ok: false, reason: "permission_denied" };
    const buttons = sanitizeDockButtons(payload?.buttons);
    if (buttons.length === 0) {
      addonDockButtonsState.delete(normalizedId);
      removeAddonDockGroup(normalizedId);
      return { ok: true, value: { rendered: true, count: 0 } };
    }

    addonDockButtonsState.set(normalizedId, buttons);
    const rendered = renderAddonDockGroup(normalizedId, buttons);
    if (!rendered) scheduleAddonDockFlush();
    return { ok: true, value: { rendered, count: buttons.length } };
  }

  if (action === "ui.dock.removeButtons") {
    if (!allowed.has("ui")) return { ok: false, reason: "permission_denied" };
    addonDockButtonsState.delete(normalizedId);
    removeAddonDockGroup(normalizedId);
    return { ok: true };
  }

  return { ok: false, reason: "unsupported_action" };
}

function bindConsoleBridgeListener() {
  if (isConsoleBridgeBound) return;

  window.addEventListener(ADDONS_DEV_COMMAND_EVENT, (event) => {
    const detail = event?.detail || {};
    const type = String(detail.type || "").trim();

    if (type === "ping") {
      const replyEvent = String(detail.replyEvent || "").trim();
      if (!replyEvent) return;
      window.dispatchEvent(
        new CustomEvent(replyEvent, {
          detail: {
            ok: true,
            apiVersion: ADDONS_API_VERSION,
          },
        }),
      );
      return;
    }

    if (type === "register") {
      const snapshot = registerAddon(detail.addon || {});
      const addonId = sanitizeAddonId(detail?.addon?.id);
      if (addonId) {
        const registered = snapshot.find((entry) => entry.id === addonId);
        if (registered?.blocked) {
          window.dispatchEvent(
            new CustomEvent(ADDON_COMMAND_EVENT, {
              detail: {
                addonId,
                command: "disable",
              },
            }),
          );
        }
      }
      return;
    }

    if (type === "unregister") {
      unregisterAddon(detail.addonId);
      return;
    }

    if (type === "update-status") {
      updateAddonStatus(detail.addonId, detail.status, detail.statusMessage || "");
      return;
    }

    if (type === "core-action") {
      const replyEvent = String(detail.replyEvent || "").trim();
      invokeAddonCoreAction(detail.addonId, detail.action, detail.payload || {}).then((result) => {
        if (replyEvent) {
          window.dispatchEvent(new CustomEvent(replyEvent, { detail: result }));
        }
      });
      return;
    }
  });

  isConsoleBridgeBound = true;
}

export function initAddonsConsoleBridge() {
  bindConsoleBridgeListener();

  return ensurePageBridge({
    marker: ADDONS_DEV_BRIDGE_MARKER,
    scriptContent: `
    (() => {
      if (window.__F95UE_ADDONS_DEV__) return;

      const dispatch = (type, payload = {}) => {
        window.dispatchEvent(
          new CustomEvent("${ADDONS_DEV_COMMAND_EVENT}", {
            detail: { type, ...payload },
          }),
        );
      };

      window.__F95UE_ADDONS_DEV__ = {
        apiVersion: "${ADDONS_API_VERSION}",
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
  `,
  });
}
