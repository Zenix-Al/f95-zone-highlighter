export const ACTION_CAPABILITY_ALTERNATIVES = Object.freeze({
  "toast.show": ["toast"],
  "feature.enable": ["feature"],
  "feature.disable": ["feature"],
  "feature.refresh": ["feature"],
  "storage.get": ["storage"],
  "storage.set": ["storage"],
  "storage.getUsage": ["storage"],
  "idb.get": ["idb"],
  "idb.put": ["idb"],
  "idb.delete": ["idb"],
  "idb.bulkPut": ["idb"],
  "idb.query": ["idb"],
  "idb.count": ["idb"],
  "observer.watch": ["observer"],
  "observer.unwatch": ["observer"],
  "ui.dock.setButtons": ["ui", "ui.dock"],
  "ui.dock.removeButtons": ["ui", "ui.dock"],
  "ui.mount": ["ui", "ui.mount"],
  "ui.update": ["ui", "ui.mount"],
  "ui.unmount": ["ui", "ui.mount"],
  "ui.dialog.open": ["ui", "ui.dialog"],
  "ui.dialog.close": ["ui", "ui.dialog"],
  "ui.confirm": ["ui", "ui.dialog"],
  "ui.style.register": ["ui", "ui.style"],
  "ui.style.unregister": ["ui", "ui.style"],
});

export function hasAnyCapability(allowed, alternatives = []) {
  if (!(allowed instanceof Set) || !Array.isArray(alternatives) || alternatives.length === 0) {
    return true;
  }
  return alternatives.some((entry) => allowed.has(entry));
}

export function isAddonActionAllowed(allowed, action) {
  const alternatives = ACTION_CAPABILITY_ALTERNATIVES[action];
  if (!alternatives) return true;
  return hasAnyCapability(allowed, alternatives);
}

export async function invokeRegisteredAddonCoreAction({
  addonId,
  action,
  payload = {},
  deps,
  limits,
}) {
  const {
    showToast,
    emitAddonLifecycleCommand,
    requestAddonTeardown,
    cancelAddonTeardown,
    updateAddonStatus,
    ensureAddonStateBucket,
    persistAddonsState,
    upsertInstalledAddonMeta,
    measurePayloadBytes,
    idbGetForAddon,
    idbPutForAddon,
    idbDeleteForAddon,
    idbBulkPutForAddon,
    idbQueryForAddon,
    idbCountForAddon,
    watchAddonObserver,
    unwatchAddonObserver,
    sanitizeDockButtons,
    setAddonDockButtons,
    removeAddonDockButtons,
    sanitizeAddonMountId,
    mountAddonUi,
    updateAddonUi,
    unmountAddonUi,
    sanitizeAddonDialogId,
    openAddonDialog,
    closeAddonDialog,
    openConfirmDialog,
    sanitizeAddonStyleId,
    registerAddonStyle,
    unregisterAddonStyle,
    emitAddonCommand,
  } = deps;
  const {
    maxAddonStorageValueBytes,
    maxAddonStorageTotalBytes,
    maxAddonIdbPayloadBytes,
    maxAddonIdbBulkItems,
    maxAddonUiHtmlBytes,
    maxAddonStyleTextBytes,
  } = limits;

  const actionHandlers = {
    "toast.show": async (payload) => actionToastShow(showToast, payload),
    "feature.enable": async () =>
      await actionFeatureEnableDisable(
        addonId,
        "feature.enable",
        updateAddonStatus,
        emitAddonLifecycleCommand,
        ensureAddonStateBucket,
        persistAddonsState,
        upsertInstalledAddonMeta,
        requestAddonTeardown,
        cancelAddonTeardown,
      ),
    "feature.disable": async () =>
      await actionFeatureEnableDisable(
        addonId,
        "feature.disable",
        updateAddonStatus,
        emitAddonLifecycleCommand,
        ensureAddonStateBucket,
        persistAddonsState,
        upsertInstalledAddonMeta,
        requestAddonTeardown,
        cancelAddonTeardown,
      ),
    "feature.refresh": () => actionFeatureRefresh(addonId, emitAddonCommand),
    "storage.get": async (payload) =>
      actionStorageGet(addonId, payload, ensureAddonStateBucket, persistAddonsState),
    "storage.set": async (payload) =>
      actionStorageSet(
        addonId,
        payload,
        measurePayloadBytes,
        maxAddonStorageValueBytes,
        maxAddonStorageTotalBytes,
        ensureAddonStateBucket,
        persistAddonsState,
      ),
    "storage.getUsage": () =>
      actionStorageGetUsage(
        addonId,
        measurePayloadBytes,
        maxAddonStorageValueBytes,
        maxAddonStorageTotalBytes,
        ensureAddonStateBucket,
      ),
    "idb.get": async (payload) =>
      actionIdbGet(addonId, payload, measurePayloadBytes, maxAddonIdbPayloadBytes, idbGetForAddon),
    "idb.put": async (payload) =>
      actionIdbPut(addonId, payload, measurePayloadBytes, maxAddonIdbPayloadBytes, idbPutForAddon),
    "idb.delete": async (payload) =>
      actionIdbDelete(
        addonId,
        payload,
        measurePayloadBytes,
        maxAddonIdbPayloadBytes,
        idbDeleteForAddon,
      ),
    "idb.bulkPut": async (payload) =>
      actionIdbBulkPut(
        addonId,
        payload,
        measurePayloadBytes,
        maxAddonIdbPayloadBytes,
        maxAddonIdbBulkItems,
        idbBulkPutForAddon,
      ),
    "idb.query": async (payload) =>
      actionIdbQuery(
        addonId,
        payload,
        measurePayloadBytes,
        maxAddonIdbPayloadBytes,
        idbQueryForAddon,
      ),
    "idb.count": async (payload) =>
      actionIdbCount(
        addonId,
        payload,
        measurePayloadBytes,
        maxAddonIdbPayloadBytes,
        idbCountForAddon,
      ),
    "observer.watch": (payload) => actionObserverWatch(addonId, payload, watchAddonObserver),
    "observer.unwatch": (payload) => actionObserverUnwatch(addonId, payload, unwatchAddonObserver),
    "ui.dock.setButtons": (payload) =>
      actionUiDockSetButtons(addonId, payload, sanitizeDockButtons, setAddonDockButtons),
    "ui.dock.removeButtons": () => actionUiDockRemoveButtons(addonId, removeAddonDockButtons),
    "ui.mount": (payload) =>
      actionUiMount(addonId, payload, maxAddonUiHtmlBytes, sanitizeAddonMountId, mountAddonUi),
    "ui.update": (payload) =>
      actionUiUpdate(addonId, payload, maxAddonUiHtmlBytes, sanitizeAddonMountId, updateAddonUi),
    "ui.unmount": (payload) => actionUiUnmount(addonId, payload, unmountAddonUi),
    "ui.dialog.open": (payload) =>
      actionUiDialogOpen(
        addonId,
        payload,
        maxAddonUiHtmlBytes,
        sanitizeAddonDialogId,
        openAddonDialog,
      ),
    "ui.dialog.close": (payload) => actionUiDialogClose(addonId, payload, closeAddonDialog),
    "ui.confirm": async (payload) => await actionUiConfirm(payload, openConfirmDialog),
    "ui.style.register": (payload) =>
      actionUiStyleRegister(
        addonId,
        payload,
        maxAddonStyleTextBytes,
        sanitizeAddonStyleId,
        registerAddonStyle,
      ),
    "ui.style.unregister": (payload) =>
      actionUiStyleUnregister(addonId, payload, unregisterAddonStyle),
  };

  const handler = actionHandlers[action];
  if (handler) {
    return await handler(payload);
  }
  return { ok: false, reason: "unsupported_action" };
}

function actionToastShow(showToast, payload) {
  const message = String(payload?.message || "").trim();
  if (!message) return { ok: false, reason: "message_required" };
  const type = String(payload?.type || "info").trim();
  showToast(message, undefined, type);
  return { ok: true };
}

async function actionFeatureEnableDisable(
  addonId,
  action,
  updateAddonStatus,
  emitAddonLifecycleCommand,
  ensureAddonStateBucket,
  persistAddonsState,
  upsertInstalledAddonMeta,
  requestAddonTeardown,
  cancelAddonTeardown,
) {
  const enabled = action === "feature.enable";
  const nextStatus = enabled ? "installed" : "disabled";
  const nextMessage = enabled ? "Feature is active." : "";

  updateAddonStatus(addonId, nextStatus, nextMessage);

  const stateBucket = ensureAddonStateBucket(addonId);
  stateBucket.enabled = enabled;
  const persisted = await persistAddonsState();
  const persistedMeta = await upsertInstalledAddonMeta(addonId, {
    statusMessage: nextMessage,
  });

  if (!enabled) {
    emitAddonLifecycleCommand(addonId, "before-disable");
    requestAddonTeardown(addonId, "disable");
  } else {
    cancelAddonTeardown?.(addonId);
  }

  emitAddonLifecycleCommand(addonId, enabled ? "enable" : "disable");

  if (!persisted.ok || !persistedMeta.ok) return { ok: false, reason: "storage_error" };
  return { ok: true };
}

function actionFeatureRefresh(addonId, emitAddonCommand) {
  emitAddonCommand(addonId, "refresh");
  return { ok: true };
}

async function actionStorageGet(addonId, payload, ensureAddonStateBucket, persistAddonsState) {
  const key = String(payload?.key || "").trim();
  if (!key) return { ok: false, reason: "key_required" };

  const stateBucket = ensureAddonStateBucket(addonId);
  if (Object.prototype.hasOwnProperty.call(stateBucket, key)) {
    return { ok: true, value: stateBucket[key] };
  }

  try {
    const legacyValue = await GM.getValue(`addon:${addonId}:${key}`, undefined);
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

async function actionStorageSet(
  addonId,
  payload,
  measurePayloadBytes,
  maxAddonStorageValueBytes,
  maxAddonStorageTotalBytes,
  ensureAddonStateBucket,
  persistAddonsState,
) {
  const key = String(payload?.key || "").trim();
  if (!key) return { ok: false, reason: "key_required" };

  const newValue = payload?.value ?? null;
  const valueBytes = measurePayloadBytes(newValue);
  if (valueBytes > maxAddonStorageValueBytes) {
    return { ok: false, reason: "payload_too_large" };
  }

  const stateBucket = ensureAddonStateBucket(addonId);
  const hadKey = Object.prototype.hasOwnProperty.call(stateBucket, key);
  const previousValue = hadKey ? stateBucket[key] : undefined;
  stateBucket[key] = newValue;

  const totalBytes = measurePayloadBytes(stateBucket);
  if (totalBytes > maxAddonStorageTotalBytes) {
    if (hadKey) {
      stateBucket[key] = previousValue;
    } else {
      delete stateBucket[key];
    }
    return { ok: false, reason: "quota_exceeded" };
  }

  const persisted = await persistAddonsState();
  if (!persisted.ok) {
    if (hadKey) {
      stateBucket[key] = previousValue;
    } else {
      delete stateBucket[key];
    }
    return { ok: false, reason: "storage_error" };
  }
  return { ok: true };
}

function actionStorageGetUsage(
  addonId,
  measurePayloadBytes,
  maxAddonStorageValueBytes,
  maxAddonStorageTotalBytes,
  ensureAddonStateBucket,
) {
  const stateBucket = ensureAddonStateBucket(addonId);
  const estimatedBytes = measurePayloadBytes(stateBucket);
  const valueCount = Object.keys(stateBucket).length;
  return {
    ok: true,
    value: {
      valueCount,
      estimatedBytes,
      valueLimitBytes: maxAddonStorageValueBytes,
      totalLimitBytes: maxAddonStorageTotalBytes,
    },
  };
}

async function actionIdbGet(
  addonId,
  payload,
  measurePayloadBytes,
  maxAddonIdbPayloadBytes,
  idbGetForAddon,
) {
  if (measurePayloadBytes(payload) > maxAddonIdbPayloadBytes) {
    return { ok: false, reason: "payload_too_large" };
  }
  if (!Object.prototype.hasOwnProperty.call(payload || {}, "key")) {
    return { ok: false, reason: "key_required" };
  }
  try {
    const value = await idbGetForAddon(addonId, payload || {});
    return { ok: true, value: typeof value === "undefined" ? null : value };
  } catch (error) {
    console.warn("[addonsService] idb core-action failed:", error);
    return { ok: false, reason: "idb_error" };
  }
}

async function actionIdbPut(
  addonId,
  payload,
  measurePayloadBytes,
  maxAddonIdbPayloadBytes,
  idbPutForAddon,
) {
  if (measurePayloadBytes(payload) > maxAddonIdbPayloadBytes) {
    return { ok: false, reason: "payload_too_large" };
  }
  if (!Object.prototype.hasOwnProperty.call(payload || {}, "value")) {
    return { ok: false, reason: "value_required" };
  }
  try {
    const key = await idbPutForAddon(addonId, payload || {});
    return { ok: true, value: key };
  } catch (error) {
    console.warn("[addonsService] idb core-action failed:", error);
    return { ok: false, reason: "idb_error" };
  }
}

async function actionIdbDelete(
  addonId,
  payload,
  measurePayloadBytes,
  maxAddonIdbPayloadBytes,
  idbDeleteForAddon,
) {
  if (measurePayloadBytes(payload) > maxAddonIdbPayloadBytes) {
    return { ok: false, reason: "payload_too_large" };
  }
  if (!Object.prototype.hasOwnProperty.call(payload || {}, "key")) {
    return { ok: false, reason: "key_required" };
  }
  try {
    await idbDeleteForAddon(addonId, payload || {});
    return { ok: true };
  } catch (error) {
    console.warn("[addonsService] idb core-action failed:", error);
    return { ok: false, reason: "idb_error" };
  }
}

async function actionIdbBulkPut(
  addonId,
  payload,
  measurePayloadBytes,
  maxAddonIdbPayloadBytes,
  maxAddonIdbBulkItems,
  idbBulkPutForAddon,
) {
  if (measurePayloadBytes(payload) > maxAddonIdbPayloadBytes) {
    return { ok: false, reason: "payload_too_large" };
  }
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  if (entries.length > maxAddonIdbBulkItems) {
    return { ok: false, reason: "too_many_items" };
  }
  try {
    await idbBulkPutForAddon(addonId, { ...payload, entries });
    return { ok: true, value: entries.length };
  } catch (error) {
    console.warn("[addonsService] idb core-action failed:", error);
    return { ok: false, reason: "idb_error" };
  }
}

async function actionIdbQuery(
  addonId,
  payload,
  measurePayloadBytes,
  maxAddonIdbPayloadBytes,
  idbQueryForAddon,
) {
  if (measurePayloadBytes(payload) > maxAddonIdbPayloadBytes) {
    return { ok: false, reason: "payload_too_large" };
  }
  try {
    const rows = await idbQueryForAddon(addonId, payload || {});
    return { ok: true, value: rows };
  } catch (error) {
    console.warn("[addonsService] idb core-action failed:", error);
    return { ok: false, reason: "idb_error" };
  }
}

async function actionIdbCount(
  addonId,
  payload,
  measurePayloadBytes,
  maxAddonIdbPayloadBytes,
  idbCountForAddon,
) {
  if (measurePayloadBytes(payload) > maxAddonIdbPayloadBytes) {
    return { ok: false, reason: "payload_too_large" };
  }
  try {
    const count = await idbCountForAddon(addonId, payload || {});
    return { ok: true, value: Number(count || 0) };
  } catch (error) {
    console.warn("[addonsService] idb core-action failed:", error);
    return { ok: false, reason: "idb_error" };
  }
}

function actionObserverWatch(addonId, payload, watchAddonObserver) {
  return watchAddonObserver(addonId, payload);
}

function actionObserverUnwatch(addonId, payload, unwatchAddonObserver) {
  return unwatchAddonObserver(addonId, payload);
}

function actionUiDockSetButtons(addonId, payload, sanitizeDockButtons, setAddonDockButtons) {
  const buttons = sanitizeDockButtons(payload?.buttons);
  return { ok: true, value: setAddonDockButtons(addonId, buttons) };
}

function actionUiDockRemoveButtons(addonId, removeAddonDockButtons) {
  removeAddonDockButtons(addonId);
  return { ok: true };
}

function actionUiMount(addonId, payload, maxAddonUiHtmlBytes, sanitizeAddonMountId, mountAddonUi) {
  const mountId = sanitizeAddonMountId(payload?.mountId || payload?.id || "");
  const html = String(payload?.html || payload?.template || "");
  const slot = String(payload?.slot || "body");
  const position = String(payload?.position || "append");

  if (!mountId) return { ok: false, reason: "mount_id_required" };
  if (!html.trim()) return { ok: false, reason: "html_required" };
  if (html.length > maxAddonUiHtmlBytes) {
    return { ok: false, reason: "payload_too_large" };
  }

  return mountAddonUi(addonId, { mountId, html, slot, position });
}

function actionUiUpdate(
  addonId,
  payload,
  maxAddonUiHtmlBytes,
  sanitizeAddonMountId,
  updateAddonUi,
) {
  const mountId = sanitizeAddonMountId(payload?.mountId || payload?.id || "");
  const html = String(payload?.html || payload?.template || "");
  if (!mountId) return { ok: false, reason: "mount_id_required" };
  if (!html.trim()) return { ok: false, reason: "html_required" };
  if (html.length > maxAddonUiHtmlBytes) {
    return { ok: false, reason: "payload_too_large" };
  }

  return updateAddonUi(addonId, { mountId, html });
}

function actionUiUnmount(addonId, payload, unmountAddonUi) {
  const mountId = String(payload?.mountId || payload?.id || "");
  return unmountAddonUi(addonId, mountId);
}

function actionUiDialogOpen(
  addonId,
  payload,
  maxAddonUiHtmlBytes,
  sanitizeAddonDialogId,
  openAddonDialog,
) {
  const dialogId = sanitizeAddonDialogId(payload?.dialogId || payload?.id || "");
  const html = String(payload?.html || payload?.template || "");
  if (!dialogId) return { ok: false, reason: "dialog_id_required" };
  if (!html.trim()) return { ok: false, reason: "html_required" };
  if (html.length > maxAddonUiHtmlBytes) {
    return { ok: false, reason: "payload_too_large" };
  }
  return openAddonDialog(addonId, { ...payload, dialogId, html });
}

function actionUiDialogClose(addonId, payload, closeAddonDialog) {
  const dialogId = String(payload?.dialogId || payload?.id || "");
  const reason = String(payload?.reason || "addon-request");
  return closeAddonDialog(addonId, dialogId, reason);
}

async function actionUiConfirm(payload, openConfirmDialog) {
  if (typeof openConfirmDialog !== "function") {
    return { ok: false, reason: "unsupported_action" };
  }
  const confirmed = await openConfirmDialog({
    title: String(payload?.title || "Confirm"),
    description: String(payload?.description || payload?.message || "Are you sure?"),
    confirmLabel: String(payload?.confirmLabel || "Confirm"),
    cancelLabel: String(payload?.cancelLabel || "Cancel"),
  });
  return { ok: true, value: { confirmed: Boolean(confirmed) } };
}

function actionUiStyleRegister(
  addonId,
  payload,
  maxAddonStyleTextBytes,
  sanitizeAddonStyleId,
  registerAddonStyle,
) {
  const styleId = sanitizeAddonStyleId(payload?.styleId || payload?.id || "");
  const cssText = String(payload?.cssText || payload?.css || "");
  if (!styleId) return { ok: false, reason: "style_id_required" };
  if (!cssText.trim()) return { ok: false, reason: "css_required" };
  if (cssText.length > maxAddonStyleTextBytes) {
    return { ok: false, reason: "payload_too_large" };
  }

  return registerAddonStyle(addonId, { styleId, cssText });
}

function actionUiStyleUnregister(addonId, payload, unregisterAddonStyle) {
  const styleId = String(payload?.styleId || payload?.id || "");
  return unregisterAddonStyle(addonId, styleId);
}
