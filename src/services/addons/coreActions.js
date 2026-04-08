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

  if (action === "toast.show") {
    const message = String(payload?.message || "").trim();
    if (!message) return { ok: false, reason: "message_required" };
    showToast(message);
    return { ok: true };
  }

  if (action === "feature.enable" || action === "feature.disable") {
    const enabled = action === "feature.enable";
    const nextStatus = enabled ? "installed" : "disabled";
    const nextMessage = enabled ? "Feature is active." : "Feature is currently disabled.";

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

  if (action === "feature.refresh") {
    emitAddonCommand(addonId, "refresh");
    return { ok: true };
  }

  if (action === "storage.get") {
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

  if (action === "storage.set") {
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

  if (action === "storage.getUsage") {
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

  if (
    action === "idb.get" ||
    action === "idb.put" ||
    action === "idb.delete" ||
    action === "idb.bulkPut" ||
    action === "idb.query" ||
    action === "idb.count"
  ) {
    if (measurePayloadBytes(payload) > maxAddonIdbPayloadBytes) {
      return { ok: false, reason: "payload_too_large" };
    }

    if (action === "idb.bulkPut") {
      const entries = Array.isArray(payload?.entries) ? payload.entries : [];
      if (entries.length > maxAddonIdbBulkItems) {
        return { ok: false, reason: "too_many_items" };
      }
    }

    try {
      if (action === "idb.get") {
        if (!Object.prototype.hasOwnProperty.call(payload || {}, "key")) {
          return { ok: false, reason: "key_required" };
        }
        const value = await idbGetForAddon(addonId, payload || {});
        return { ok: true, value: typeof value === "undefined" ? null : value };
      }

      if (action === "idb.put") {
        if (!Object.prototype.hasOwnProperty.call(payload || {}, "value")) {
          return { ok: false, reason: "value_required" };
        }
        const key = await idbPutForAddon(addonId, payload || {});
        return { ok: true, value: key };
      }

      if (action === "idb.delete") {
        if (!Object.prototype.hasOwnProperty.call(payload || {}, "key")) {
          return { ok: false, reason: "key_required" };
        }
        await idbDeleteForAddon(addonId, payload || {});
        return { ok: true };
      }

      if (action === "idb.bulkPut") {
        const entries = Array.isArray(payload?.entries) ? payload.entries : [];
        await idbBulkPutForAddon(addonId, { ...payload, entries });
        return { ok: true, value: entries.length };
      }

      if (action === "idb.query") {
        const rows = await idbQueryForAddon(addonId, payload || {});
        return { ok: true, value: rows };
      }

      if (action === "idb.count") {
        const count = await idbCountForAddon(addonId, payload || {});
        return { ok: true, value: Number(count || 0) };
      }
    } catch (error) {
      console.warn("[addonsService] idb core-action failed:", error);
      return { ok: false, reason: "idb_error" };
    }
  }

  if (action === "observer.watch") {
    return watchAddonObserver(addonId, payload);
  }

  if (action === "observer.unwatch") {
    return unwatchAddonObserver(addonId, payload);
  }

  if (action === "ui.dock.setButtons") {
    const buttons = sanitizeDockButtons(payload?.buttons);
    return { ok: true, value: setAddonDockButtons(addonId, buttons) };
  }

  if (action === "ui.dock.removeButtons") {
    removeAddonDockButtons(addonId);
    return { ok: true };
  }

  if (action === "ui.mount") {
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

  if (action === "ui.update") {
    const mountId = sanitizeAddonMountId(payload?.mountId || payload?.id || "");
    const html = String(payload?.html || payload?.template || "");
    if (!mountId) return { ok: false, reason: "mount_id_required" };
    if (!html.trim()) return { ok: false, reason: "html_required" };
    if (html.length > maxAddonUiHtmlBytes) {
      return { ok: false, reason: "payload_too_large" };
    }

    return updateAddonUi(addonId, { mountId, html });
  }

  if (action === "ui.unmount") {
    const mountId = String(payload?.mountId || payload?.id || "");
    return unmountAddonUi(addonId, mountId);
  }

  if (action === "ui.dialog.open") {
    const dialogId = sanitizeAddonDialogId(payload?.dialogId || payload?.id || "");
    const html = String(payload?.html || payload?.template || "");
    if (!dialogId) return { ok: false, reason: "dialog_id_required" };
    if (!html.trim()) return { ok: false, reason: "html_required" };
    if (html.length > maxAddonUiHtmlBytes) {
      return { ok: false, reason: "payload_too_large" };
    }
    return openAddonDialog(addonId, { ...payload, dialogId, html });
  }

  if (action === "ui.dialog.close") {
    const dialogId = String(payload?.dialogId || payload?.id || "");
    const reason = String(payload?.reason || "addon-request");
    return closeAddonDialog(addonId, dialogId, reason);
  }

  if (action === "ui.style.register") {
    const styleId = sanitizeAddonStyleId(payload?.styleId || payload?.id || "");
    const cssText = String(payload?.cssText || payload?.css || "");
    if (!styleId) return { ok: false, reason: "style_id_required" };
    if (!cssText.trim()) return { ok: false, reason: "css_required" };
    if (cssText.length > maxAddonStyleTextBytes) {
      return { ok: false, reason: "payload_too_large" };
    }

    return registerAddonStyle(addonId, { styleId, cssText });
  }

  if (action === "ui.style.unregister") {
    const styleId = String(payload?.styleId || payload?.id || "");
    return unregisterAddonStyle(addonId, styleId);
  }

  return { ok: false, reason: "unsupported_action" };
}
