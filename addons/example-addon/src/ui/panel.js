import { escapeHtml } from "../../../shared/htmlUtils.js";

function renderJson(value) {
  if (value === null || typeof value === "undefined" || value === "") {
    return "-";
  }
  if (typeof value === "string") {
    return escapeHtml(value);
  }
  try {
    return escapeHtml(JSON.stringify(value, null, 2));
  } catch {
    return escapeHtml(String(value));
  }
}

function renderSection(title, description, actions, result) {
  return `
    <section class="f95ue-example-section">
      <div class="f95ue-example-grid">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(description)}</p>
        <div class="f95ue-example-actions">${actions}</div>
        <div class="f95ue-example-result">${renderJson(result)}</div>
      </div>
    </section>
  `;
}

function renderButton(action, label, className = "") {
  return `<button type="button" class="f95ue-example-button${className ? ` ${className}` : ""}" data-example-action="${escapeHtml(action)}">${escapeHtml(label)}</button>`;
}

function renderLogs(logs = []) {
  if (!Array.isArray(logs) || logs.length === 0) {
    return `<div class="f95ue-example-result">-</div>`;
  }
  return `<ol class="f95ue-example-log">${logs
    .map((entry) => `<li>${escapeHtml(entry)}</li>`)
    .join("")}</ol>`;
}

export function renderExamplePanel(state) {
  const metaResult = {
    access: state.meta.access,
    throttle: state.meta.throttle,
  };
  const storageResult = {
    value: state.storage.value,
    usage: state.storage.usage,
    tagPrefsSummary: state.storage.tagPrefsSummary,
  };
  const idbResult = {
    lastRecord: state.idb.lastRecord,
    count: state.idb.count,
    rows: state.idb.rows,
    bulkImport: state.idb.bulkImport,
  };
  const observerResult = {
    watching: state.observer.isWatching,
    eventCount: state.observer.eventCount,
    lastBatchSize: state.observer.lastBatchSize,
    lastNodeTags: state.observer.lastNodeTags,
  };
  const uiResult = {
    styleRegistered: state.ui.styleRegistered,
    dockLauncherMounted: state.ui.dockLauncherMounted,
    dockButtonsActive: state.ui.dockButtonsActive,
    extraMountActive: state.ui.extraMountActive,
    panelOpen: state.ui.panelOpen,
    dialogOpen: state.ui.dialogOpen,
    lastConfirm: state.ui.lastConfirm,
  };

  return `
    <div class="f95ue-example-panel" data-example-root="panel">
      <div class="f95ue-example-panel-header">
        <div class="f95ue-example-header-row">
          <div class="f95ue-example-header-copy">
            <h2>Example Add-on Playground</h2>
            <p>This panel opens from the dock launcher and exercises every current core action through api modules.</p>
          </div>
          <button type="button" class="f95ue-example-button secondary" data-example-action="panel-close">
            Close
          </button>
        </div>
        <div class="f95ue-example-inline-meta">
          <span>enabled: ${state.enabled ? "true" : "false"}</span>
          <span>trusted: ${state.meta.access?.trusted === true ? "true" : "unknown"}</span>
          <span>observer: ${state.observer.isWatching ? "watching" : "idle"}</span>
        </div>
        <div class="f95ue-example-note">
          The dock launcher is mounted with <code>ui.mount</code> on <code>page.dock</code>. Feature disable will hide this panel and dock until you re-enable the add-on from core.
        </div>
      </div>

      ${renderSection(
        "Meta",
        "Read-only core meta helpers.",
        [
          renderButton("meta-access", "addon.access"),
          renderButton("meta-throttle", "addon.throttle"),
        ].join(""),
        metaResult,
      )}

      ${renderSection(
        "Toast + Feature",
        "Show toast and exercise feature lifecycle commands.",
        [
          renderButton("toast-show", "toast.show"),
          renderButton("feature-enable", "feature.enable"),
          renderButton("feature-refresh", "feature.refresh"),
          renderButton("feature-disable", "feature.disable", "danger"),
        ].join(""),
        {
          lastAction: state.lastAction,
          lastResult: state.lastResult,
        },
      )}

      ${renderSection(
        "Storage",
        "Read, write, inspect usage, and fetch core tag preferences.",
        [
          renderButton("storage-set", "storage.set"),
          renderButton("storage-get", "storage.get"),
          renderButton("storage-usage", "storage.getUsage"),
          renderButton("storage-tags", "config.getTagPrefs"),
        ].join(""),
        storageResult,
      )}

      ${renderSection(
        "IndexedDB",
        "Exercise the full add-on-scoped IDB surface.",
        [
          renderButton("idb-put", "idb.put"),
          renderButton("idb-get", "idb.get"),
          renderButton("idb-bulk-put", "idb.bulkPut demo"),
          renderButton("idb-bulk-delete", "idb.bulkDelete demo records", "danger"),
          renderButton("idb-query", "idb.query"),
          renderButton("idb-count", "idb.count"),
          renderButton("idb-delete", "idb.delete"),
        ].join(""),
        idbResult,
      )}

      ${renderSection(
        "Observer",
        "Watch DOM additions through the core observer bridge.",
        [
          renderButton("observer-watch", "observer.watch"),
          renderButton("observer-add-node", "add test node"),
          renderButton("observer-unwatch", "observer.unwatch"),
        ].join(""),
        observerResult,
      )}

      ${renderSection(
        "UI APIs",
        "Core-hosted style, mount, dialog, confirm, and dock helpers.",
        [
          renderButton("style-register", "ui.style.register"),
          renderButton("style-unregister", "ui.style.unregister"),
          renderButton("mount-extra", "ui.mount"),
          renderButton("update-extra", "ui.update"),
          renderButton("unmount-extra", "ui.unmount"),
          renderButton("dialog-open", "ui.dialog.open"),
          renderButton("dialog-confirm", "ui.confirm"),
          renderButton("dialog-close", "ui.dialog.close"),
          renderButton("dock-set", "ui.dock.setButtons"),
          renderButton("dock-remove", "ui.dock.removeButtons"),
        ].join(""),
        uiResult,
      )}

      <section class="f95ue-example-section">
        <div class="f95ue-example-grid">
          <h3>Logs</h3>
          <p>Recent action results and observer events.</p>
          ${renderLogs(state.logs)}
        </div>
      </section>
    </div>
  `;
}
