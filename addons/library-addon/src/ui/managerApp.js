import { LIBRARY_MANAGER_PAGE_SIZE } from "../constants.js";
import { escapeHtml } from "../../../shared/htmlUtils.js";
import { createDialogMarkup, ensureStyle, getStyleText } from "./renderer.js";

const ROWS_STATUS_ID = "f95ue-library-rows-status";
const SEARCH_DEBOUNCE_MS = 220;

function fmtDate(ts) {
  const value = Number(ts || 0);
  if (!Number.isFinite(value) || value <= 0) return "-";
  return new Date(value).toLocaleString();
}

function safeText(value) {
  return String(value || "").trim();
}

function compareNumber(left, operator, right) {
  if (!Number.isFinite(left)) return false;
  if (operator === ">") return left > right;
  if (operator === ">=") return left >= right;
  if (operator === "<") return left < right;
  if (operator === "<=") return left <= right;
  return left === right;
}

function parseSearchQuery(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return { text: "", tokens: [] };

  const parts = raw.split(/\s+/).filter(Boolean);
  const textParts = [];
  const tokens = [];

  for (const part of parts) {
    const token = part.toLowerCase();

    if (token === "pinned" || token === "is:pinned") {
      tokens.push({ type: "pinned", value: true });
      continue;
    }
    if (token === "unpinned" || token === "is:unpinned") {
      tokens.push({ type: "pinned", value: false });
      continue;
    }
    if (token === "has:note" || token === "note") {
      tokens.push({ type: "hasNote", value: true });
      continue;
    }
    if (token === "has:no-note" || token === "nonote") {
      tokens.push({ type: "hasNote", value: false });
      continue;
    }

    if (token.startsWith("status:")) {
      const value = safeText(token.slice(7));
      if (value) tokens.push({ type: "status", value });
      continue;
    }

    if (token.startsWith("tag:")) {
      const value = safeText(token.slice(4));
      if (value) tokens.push({ type: "tag", value });
      continue;
    }

    if (token.startsWith("id:")) {
      const value = safeText(token.slice(3));
      if (value) tokens.push({ type: "id", value });
      continue;
    }

    const scoreMatch = token.match(/^score(<=|>=|=|<|>)(\d+(?:\.\d+)?)$/);
    if (scoreMatch) {
      tokens.push({
        type: "score",
        operator: scoreMatch[1],
        value: Number(scoreMatch[2]),
      });
      continue;
    }

    textParts.push(part);
  }

  return {
    text: textParts.join(" "),
    tokens,
  };
}

function matchesSearchTokens(entry, tokens = []) {
  if (!Array.isArray(tokens) || tokens.length === 0) return true;

  const tags = Array.isArray(entry?.tags)
    ? entry.tags.map((tag) => safeText(tag).toLowerCase())
    : [];
  const status = safeText(entry?.userStatus).toLowerCase();
  const threadId = safeText(entry?.threadId).toLowerCase();
  const note = safeText(entry?.note);
  const score = Number(entry?.userScore);

  for (const token of tokens) {
    if (token.type === "pinned") {
      if (Boolean(entry?.pinned) !== Boolean(token.value)) return false;
      continue;
    }

    if (token.type === "hasNote") {
      const hasNote = note.length > 0;
      if (hasNote !== Boolean(token.value)) return false;
      continue;
    }

    if (token.type === "status") {
      if (status !== token.value) return false;
      continue;
    }

    if (token.type === "tag") {
      if (!tags.some((tag) => tag.includes(token.value))) return false;
      continue;
    }

    if (token.type === "id") {
      if (!threadId.includes(token.value)) return false;
      continue;
    }

    if (token.type === "score") {
      if (!compareNumber(score, token.operator, token.value)) return false;
    }
  }

  return true;
}

function renderRows(tbody, rows = [], selectedIds = new Set(), activeId = "") {
  tbody.innerHTML = rows
    .map((entry) => {
      const tags = Array.isArray(entry.tags) ? entry.tags.slice(0, 6).join(", ") : "";
      const title = safeText(entry.title) || "Untitled";
      const gameVersion = safeText(entry.gameVersion) || "-";
      const userScore = Number.isFinite(Number(entry.userScore))
        ? Number(entry.userScore).toFixed(1)
        : "-";
      const checked = selectedIds.has(entry.threadId) ? "checked" : "";
      const rowClass = activeId && activeId === entry.threadId ? ' class="is-active"' : "";
      return `
        <tr data-thread-id="${entry.threadId}"${rowClass}>
          <td>
            <input type="checkbox" data-action="toggle-select" data-thread-id="${entry.threadId}" ${checked} />
          </td>
          <td><a href="${safeText(entry.url) || "#"}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a></td>
          <td>${escapeHtml(safeText(entry.userStatus) || "saved")}</td>
          <td>${userScore}</td>
          <td>${fmtDate(entry.updatedAt)}</td>
          <td>${escapeHtml(gameVersion)}</td>
          <td title="${escapeHtml(tags)}">${escapeHtml(tags || "-")}</td>
          <td>
            <button type="button" data-action="remove" data-thread-id="${entry.threadId}">Remove</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

export function createLibraryManagerApp({
  bridge,
  addonId,
  library,
  onMutated,
  getCurrentThreadSnapshot,
}) {
  const dialogId = `${String(addonId || "library-addon")}-manager`;
  const styleId = `f95ue-${String(addonId || "library-addon")}-manager-style`;
  const state = {
    search: "",
    status: "all",
    sortBy: "updatedAt",
    sortDir: "desc",
    page: 1,
    rows: [],
    selectedIds: new Set(),
    activeId: "",
    detailOpen: false,
    isLoading: false,
    errorMessage: "",
  };

  let dialogRoot = null;
  let dialogOpen = false;
  let searchDebounceTimer = 0;

  function syncLayoutState(root) {
    const windowEl = root.querySelector(".f95ue-library-manager-window");
    const toggleBtn = root.querySelector('[data-role="toggleDetail"]');
    const shouldOpen = state.detailOpen;
    if (windowEl) {
      windowEl.classList.toggle("is-detail-open", shouldOpen);
    }
    if (toggleBtn) {
      toggleBtn.textContent = shouldOpen ? "Hide Details" : "Details";
      toggleBtn.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
    }
  }

  function getActiveRoot() {
    return dialogRoot && document.contains(dialogRoot) ? dialogRoot : null;
  }

  async function registerStyle() {
    const cssText = getStyleText();
    const result = await bridge.invokeCoreAction("ui.style.register", {
      styleId,
      cssText,
    });
    if (!result?.ok) {
      ensureStyle(styleId);
    }
  }

  async function unregisterStyle() {
    const result = await bridge.invokeCoreAction("ui.style.unregister", {
      styleId,
    });
    if (!result?.ok) {
      const existing = document.getElementById(styleId);
      existing?.remove();
    }
  }

  function showToast(root, message, type = "info") {
    const stack = root.querySelector('[data-role="toastStack"]');
    if (!stack) return;

    const toast = document.createElement("div");
    toast.className = `f95ue-library-toast ${type}`;
    toast.textContent = String(message || "");
    stack.appendChild(toast);

    window.requestAnimationFrame(() => toast.classList.add("show"));

    window.setTimeout(() => {
      toast.classList.remove("show");
      window.setTimeout(() => toast.remove(), 180);
    }, 2600);
  }

  async function askConfirm(
    _root,
    {
      title = "Confirm",
      message = "Are you sure?",
      confirmText = "Confirm",
      cancelText = "Cancel",
      danger = false,
    } = {},
  ) {
    const result = await bridge.invokeCoreAction("ui.confirm", {
      title,
      description: message,
      confirmLabel: confirmText,
      cancelLabel: cancelText,
      danger: Boolean(danger),
    });
    if (!result?.ok) return false;
    return Boolean(result?.value?.confirmed);
  }

  function getActiveEntry() {
    if (!state.activeId) return null;
    return state.rows.find((entry) => entry.threadId === state.activeId) || null;
  }

  function getLiveThreadSnapshot() {
    if (typeof getCurrentThreadSnapshot !== "function") return null;
    const snapshot = getCurrentThreadSnapshot();
    if (!snapshot?.threadId) return null;
    return snapshot;
  }

  function getThreadDiffSummary(entry, snapshot) {
    if (!entry || !snapshot || snapshot.threadId !== entry.threadId) {
      return { changed: false, fields: [] };
    }

    const fields = [];
    if (safeText(entry.title) !== safeText(snapshot.title)) fields.push("title");
    if (safeText(entry.prefix) !== safeText(snapshot.prefix)) fields.push("prefix");
    if (safeText(entry.gameVersion) !== safeText(snapshot.gameVersion)) fields.push("version");
    if (safeText(entry.url) !== safeText(snapshot.url)) fields.push("url");

    const leftTags = Array.isArray(entry.tags)
      ? entry.tags.map((tag) => safeText(tag)).filter(Boolean)
      : [];
    const rightTags = Array.isArray(snapshot.tags)
      ? snapshot.tags.map((tag) => safeText(tag).toLowerCase()).filter(Boolean)
      : [];
    if (leftTags.join("|") !== rightTags.join("|")) fields.push("tags");

    return {
      changed: fields.length > 0,
      fields,
    };
  }

  function renderDetailPanel(root) {
    const panel = root.querySelector('[data-role="detail"]');
    if (!panel) return;

    syncLayoutState(root);

    const entry = getActiveEntry();
    if (!entry) {
      panel.innerHTML = `
        <div class="detail-head">
          <div class="detail-title">Details Editor</div>
          <button type="button" class="ghost" data-action="detail-close">Close</button>
        </div>
        <div class="detail-empty">Select a row to edit note, status, score, and pin.</div>
      `;
      return;
    }

    const tags = Array.isArray(entry.tags) ? entry.tags.join(", ") : "";
    const gameVersion = safeText(entry.gameVersion) || "-";
    const liveSnapshot = getLiveThreadSnapshot();
    const canUpdateFromCurrentThread = Boolean(
      liveSnapshot && liveSnapshot.threadId === entry.threadId,
    );
    const diffSummary = getThreadDiffSummary(entry, liveSnapshot);
    const updateHint = !canUpdateFromCurrentThread
      ? "Open this thread page to enable update."
      : diffSummary.changed
        ? `Thread has updates: ${diffSummary.fields.join(", ")}`
        : "Up to date with current thread.";

    panel.innerHTML = `
      <div class="detail-head">
        <div class="detail-title">Details Editor</div>
        <button type="button" class="ghost" data-action="detail-close">Close</button>
      </div>
      <div class="detail-grid">
        <label>Thread ID</label>
        <input type="text" data-field="detail-threadId" value="${escapeHtml(entry.threadId)}" disabled />

        <label>Title</label>
        <input type="text" data-field="detail-title" value="${escapeHtml(safeText(entry.title))}" disabled />

        <label>Status</label>
        <select data-field="detail-status">
          <option value="saved" ${entry.userStatus === "saved" ? "selected" : ""}>saved</option>
          <option value="playing" ${entry.userStatus === "playing" ? "selected" : ""}>playing</option>
          <option value="completed" ${entry.userStatus === "completed" ? "selected" : ""}>completed</option>
          <option value="dropped" ${entry.userStatus === "dropped" ? "selected" : ""}>dropped</option>
        </select>

        <label>User Score</label>
        <input type="number" min="0" max="10" step="0.1" data-field="detail-userScore" value="${entry.userScore ?? ""}" />

        <label>Version</label>
        <input type="text" data-field="detail-gameVersion" value="${escapeHtml(gameVersion)}" disabled />

        <label>Pinned</label>
        <label class="detail-toggle"><input type="checkbox" data-field="detail-pinned" ${entry.pinned ? "checked" : ""} /> Pin this entry</label>

        <label>Tags</label>
        <input type="text" data-field="detail-tags" value="${escapeHtml(tags)}" disabled />

        <label>Note</label>
        <textarea data-field="detail-note">${escapeHtml(safeText(entry.note))}</textarea>
      </div>
      <div class="detail-actions">
        <button type="button" data-action="detail-save">Save</button>
        <button type="button" data-action="detail-revert">Revert</button>
        ${canUpdateFromCurrentThread ? '<button type="button" class="ghost" data-action="detail-update-thread">Update from This Thread</button>' : ""}
        <span class="detail-update-hint">${escapeHtml(updateHint)}</span>
      </div>
    `;
  }

  function triggerJsonDownload(filename, value) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function reloadRows(root) {
    const statusLine = root.querySelector(`#${ROWS_STATUS_ID}`);
    const parsedSearch = parseSearchQuery(state.search);
    state.isLoading = true;
    state.errorMessage = "";
    if (statusLine) {
      statusLine.classList.remove("error");
      statusLine.textContent = "Loading library...";
    }

    try {
      const rows = await library.queryEntries({
        search: parsedSearch.text,
        status: state.status,
        sortBy: state.sortBy,
        sortDir: state.sortDir,
        limit: 5000,
        offset: 0,
      });
      const incomingRows = Array.isArray(rows) ? rows : [];
      state.rows = parsedSearch.tokens.length
        ? incomingRows.filter((entry) => matchesSearchTokens(entry, parsedSearch.tokens))
        : incomingRows;
    } catch (error) {
      state.rows = [];
      state.errorMessage = String(error?.message || "Failed to load library.");
    }
    state.isLoading = false;

    const availableIds = new Set(state.rows.map((entry) => entry.threadId));
    state.selectedIds = new Set([...state.selectedIds].filter((id) => availableIds.has(id)));
    if (state.activeId && !availableIds.has(state.activeId)) {
      state.activeId = "";
    }

    const maxPage = Math.max(1, Math.ceil(state.rows.length / LIBRARY_MANAGER_PAGE_SIZE));
    if (state.page > maxPage) state.page = maxPage;

    const from = (state.page - 1) * LIBRARY_MANAGER_PAGE_SIZE;
    const pageRows = state.rows.slice(from, from + LIBRARY_MANAGER_PAGE_SIZE);

    const tbody = root.querySelector('[data-role="rows"]');
    const pageInfo = root.querySelector('[data-role="pageInfo"]');
    const selectedInfo = root.querySelector('[data-role="selectedInfo"]');
    const toggleAll = root.querySelector('[data-action="toggle-all"]');
    if (!tbody || !pageInfo) return;

    renderRows(tbody, pageRows, state.selectedIds, state.activeId);
    pageInfo.textContent = `Page ${state.page} / ${maxPage} (${state.rows.length} rows)`;
    if (selectedInfo) {
      selectedInfo.textContent = `${state.selectedIds.size} selected`;
    }
    if (toggleAll) {
      const pageIds = pageRows.map((row) => row.threadId);
      const allSelected = pageIds.length > 0 && pageIds.every((id) => state.selectedIds.has(id));
      toggleAll.checked = allSelected;
    }

    if (statusLine) {
      if (state.errorMessage) {
        statusLine.classList.add("error");
        statusLine.textContent = state.errorMessage;
      } else if (state.rows.length === 0) {
        statusLine.classList.remove("error");
        statusLine.textContent = "No entries match the current filters.";
      } else {
        statusLine.classList.remove("error");
        statusLine.textContent = "";
      }
    }

    renderDetailPanel(root);
  }

  async function handleImportFile(inputEl, root) {
    const file = inputEl?.files?.[0];
    if (!file) return;

    const text = await file.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      showToast(root, "Invalid JSON file.", "error");
      inputEl.value = "";
      return;
    }

    const records = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.records)
        ? parsed.records
        : [];

    const policyEl = root.querySelector('[data-field="conflictPolicy"]');
    const conflictPolicy = String(policyEl?.value || "newer")
      .trim()
      .toLowerCase();

    const existingRows = await library.getAllEntries("updatedAt", "desc");
    const existingIds = new Set(
      (Array.isArray(existingRows) ? existingRows : []).map((entry) => safeText(entry?.threadId)),
    );
    const importIds = new Set();
    let added = 0;
    let updates = 0;
    let invalid = 0;
    let duplicatesInFile = 0;

    records.forEach((record) => {
      const threadId = safeText(record?.threadId);
      if (!threadId) {
        invalid += 1;
        return;
      }
      if (importIds.has(threadId)) {
        duplicatesInFile += 1;
        return;
      }
      importIds.add(threadId);
      if (existingIds.has(threadId)) updates += 1;
      else added += 1;
    });

    const policyHint =
      conflictPolicy === "skip"
        ? "Existing records will be skipped."
        : conflictPolicy === "replace"
          ? "Existing records will be replaced."
          : "Existing records only update when incoming updatedAt is newer.";

    const confirmed = await askConfirm(root, {
      title: "Confirm Import",
      confirmText: "Import",
      message: [
        "Import preview:",
        `- New records: ${added}`,
        `- Existing IDs in file: ${updates}`,
        `- Invalid records (missing threadId): ${invalid}`,
        `- Duplicate IDs inside file: ${duplicatesInFile}`,
        "",
        `Policy: ${conflictPolicy}`,
        policyHint,
      ].join("\n"),
    });

    if (!confirmed) {
      inputEl.value = "";
      return;
    }

    const result = await library.importEntries(records, { conflictPolicy });
    showToast(
      root,
      `Import complete. Imported: ${result.imported}, skipped: ${result.skipped}.`,
      "success",
    );
    inputEl.value = "";

    await reloadRows(root);
    if (typeof onMutated === "function") onMutated();
  }

  function bindEvents(root) {
    const searchInput = root.querySelector('[data-field="search"]');
    const statusSelect = root.querySelector('[data-field="status"]');
    const sortSelect = root.querySelector('[data-field="sort"]');
    const importInput = root.querySelector('[data-field="importFile"]');
    const advancedPanel = root.querySelector(".f95ue-library-more-actions");

    root.addEventListener("click", async (event) => {
      const button = event.target?.closest?.("button[data-action]");
      if (!button) return;

      const action = String(button.dataset.action || "").trim();
      if (action === "close") {
        await close("addon-close");
        return;
      }

      if (action === "toggle-detail") {
        state.detailOpen = !state.detailOpen;
        syncLayoutState(root);
        return;
      }

      if (action === "detail-close") {
        state.detailOpen = false;
        syncLayoutState(root);
        return;
      }

      if (action === "prev") {
        if (state.page > 1) {
          state.page -= 1;
          await reloadRows(root);
        }
        return;
      }

      if (action === "next") {
        const maxPage = Math.max(1, Math.ceil(state.rows.length / LIBRARY_MANAGER_PAGE_SIZE));
        if (state.page < maxPage) {
          state.page += 1;
          await reloadRows(root);
        }
        return;
      }

      if (action === "remove") {
        const threadId = String(button.dataset.threadId || "").trim();
        if (!threadId) return;
        const ok = await askConfirm(root, {
          title: "Remove Entry",
          message: "Remove this entry from library?",
          confirmText: "Remove",
          danger: true,
        });
        if (!ok) return;
        const result = await library.removeEntry(threadId);
        if (!result?.ok) {
          showToast(root, "Failed to remove entry.", "error");
          return;
        }
        showToast(root, "Entry removed from library.", "success");
        await reloadRows(root);
        if (typeof onMutated === "function") onMutated();
        return;
      }

      if (action === "clear-selection") {
        state.selectedIds = new Set();
        await reloadRows(root);
        return;
      }

      if (action === "bulk-set-status") {
        const ids = [...state.selectedIds];
        if (ids.length === 0) {
          showToast(root, "Select at least one row first.", "error");
          return;
        }
        const bulkStatusEl = root.querySelector('[data-field="bulkStatus"]');
        const nextStatus = String(bulkStatusEl?.value || "saved").trim();
        const result = await library.bulkUpdateStatus(ids, nextStatus);
        showToast(
          root,
          `Bulk status updated: ${result.updated}, skipped: ${result.skipped}.`,
          "success",
        );
        await reloadRows(root);
        if (typeof onMutated === "function") onMutated();
        return;
      }

      if (action === "bulk-remove") {
        const ids = [...state.selectedIds];
        if (ids.length === 0) {
          showToast(root, "Select at least one row first.", "error");
          return;
        }
        const ok = await askConfirm(root, {
          title: "Remove Selected",
          message: `Remove ${ids.length} selected entries? This cannot be undone.`,
          confirmText: "Remove",
          danger: true,
        });
        if (!ok) return;
        const result = await library.bulkRemoveEntries(ids);
        showToast(root, `Bulk removed: ${result.removed}, skipped: ${result.skipped}.`, "success");
        state.selectedIds = new Set();
        await reloadRows(root);
        if (typeof onMutated === "function") onMutated();
        return;
      }

      if (action === "detail-save") {
        const entry = getActiveEntry();
        if (!entry) return;
        const statusField = root.querySelector('[data-field="detail-status"]');
        const scoreField = root.querySelector('[data-field="detail-userScore"]');
        const pinnedField = root.querySelector('[data-field="detail-pinned"]');
        const noteField = root.querySelector('[data-field="detail-note"]');

        const userScoreRaw = String(scoreField?.value || "").trim();
        const userScore = userScoreRaw ? Number(userScoreRaw) : null;
        if (userScoreRaw && (!Number.isFinite(userScore) || userScore < 0 || userScore > 10)) {
          showToast(root, "User score must be between 0 and 10.", "error");
          return;
        }
        const normalizedUserScore = userScoreRaw ? Number(userScore.toFixed(1)) : null;

        const result = await library.patchEntry(entry.threadId, {
          userStatus: String(statusField?.value || entry.userStatus).trim() || "saved",
          userScore: normalizedUserScore,
          pinned: Boolean(pinnedField?.checked),
          note: String(noteField?.value || "").trim(),
        });
        if (!result?.ok) {
          showToast(root, `Failed to save entry: ${result?.reason || "unknown"}`, "error");
          return;
        }

        state.detailOpen = false;
        showToast(root, "Entry saved.", "success");
        await reloadRows(root);
        if (typeof onMutated === "function") onMutated();
        return;
      }

      if (action === "detail-update-thread") {
        const entry = getActiveEntry();
        if (!entry) return;

        const snapshot = getLiveThreadSnapshot();
        if (!snapshot || snapshot.threadId !== entry.threadId) {
          showToast(root, "Update is only available on this entry's thread page.", "error");
          return;
        }

        const result = await library.patchEntry(entry.threadId, {
          url: String(snapshot.url || "").trim(),
          title: String(snapshot.title || "").trim(),
          canonicalTitle: String(snapshot.canonicalTitle || snapshot.title || "").trim(),
          titleNormalized: String(snapshot.titleNormalized || snapshot.title || "")
            .trim()
            .toLowerCase(),
          prefix: String(snapshot.prefix || "").trim(),
          gameVersion: String(snapshot.gameVersion || "").trim(),
          tags: Array.isArray(snapshot.tags) ? snapshot.tags : [],
          sourcePage: "thread",
        });

        if (!result?.ok) {
          showToast(root, `Failed to update entry: ${result?.reason || "unknown"}`, "error");
          return;
        }

        showToast(root, "Entry refreshed from current thread.", "success");
        await reloadRows(root);
        if (typeof onMutated === "function") onMutated();
        return;
      }

      if (action === "detail-revert") {
        renderDetailPanel(root);
        return;
      }

      if (action === "export") {
        const scopeEl = root.querySelector('[data-field="exportScope"]');
        const scope = String(scopeEl?.value || "all").trim();
        const payload =
          scope === "filtered"
            ? {
                version: 1,
                exportedAt: new Date().toISOString(),
                records: [...state.rows],
              }
            : await library.exportEntries();
        const filename = `f95ue-library-${new Date().toISOString().slice(0, 10)}.json`;
        triggerJsonDownload(filename, payload);
        return;
      }

      if (action === "export-selected") {
        const ids = [...state.selectedIds];
        if (ids.length === 0) {
          showToast(root, "Select at least one row first.", "error");
          return;
        }
        const selectedRows = state.rows.filter((entry) => state.selectedIds.has(entry.threadId));
        const payload = {
          version: 1,
          exportedAt: new Date().toISOString(),
          records: selectedRows,
        };
        const filename = `f95ue-library-selected-${new Date().toISOString().slice(0, 10)}.json`;
        triggerJsonDownload(filename, payload);
        return;
      }

      if (action === "import") {
        importInput?.click();
      }
    });

    root.addEventListener("change", async (event) => {
      const actionEl = event.target?.closest?.("input[data-action]");
      if (!actionEl) return;

      const action = String(actionEl.dataset.action || "").trim();
      if (action === "toggle-select") {
        const threadId = String(actionEl.dataset.threadId || "").trim();
        if (!threadId) return;
        if (actionEl.checked) state.selectedIds.add(threadId);
        else state.selectedIds.delete(threadId);
        await reloadRows(root);
        return;
      }

      if (action === "toggle-all") {
        const from = (state.page - 1) * LIBRARY_MANAGER_PAGE_SIZE;
        const pageRows = state.rows.slice(from, from + LIBRARY_MANAGER_PAGE_SIZE);
        const pageIds = pageRows.map((row) => row.threadId);
        if (actionEl.checked) {
          pageIds.forEach((id) => state.selectedIds.add(id));
        } else {
          pageIds.forEach((id) => state.selectedIds.delete(id));
        }
        await reloadRows(root);
      }
    });

    root.addEventListener("click", async (event) => {
      const row = event.target?.closest?.("tbody[data-role='rows'] tr[data-thread-id]");
      if (!row) return;
      if (
        event.target?.closest?.("button") ||
        event.target?.closest?.("a") ||
        event.target?.closest?.("input[type='checkbox']")
      ) {
        return;
      }
      const threadId = String(row.dataset.threadId || "").trim();
      if (!threadId) return;
      state.activeId = threadId;
      state.detailOpen = true;
      renderDetailPanel(root);
      await reloadRows(root);
    });

    root.addEventListener("click", (event) => {
      if (
        advancedPanel?.hasAttribute("open") &&
        !event.target?.closest?.(".f95ue-library-more-actions")
      ) {
        advancedPanel.removeAttribute("open");
      }
    });

    if (searchInput) {
      searchInput.addEventListener("input", () => {
        const nextSearch = String(searchInput.value || "").trim();
        if (searchDebounceTimer) {
          window.clearTimeout(searchDebounceTimer);
        }
        searchDebounceTimer = window.setTimeout(async () => {
          state.search = nextSearch;
          state.page = 1;
          const activeRoot = getActiveRoot();
          if (activeRoot) {
            await reloadRows(activeRoot);
          }
        }, SEARCH_DEBOUNCE_MS);
      });
    }

    if (statusSelect) {
      statusSelect.addEventListener("change", async () => {
        state.status = String(statusSelect.value || "all").trim();
        state.page = 1;
        await reloadRows(root);
      });
    }

    if (sortSelect) {
      sortSelect.addEventListener("change", async () => {
        const pair = String(sortSelect.value || "updatedAt:desc").split(":");
        state.sortBy = String(pair[0] || "updatedAt").trim();
        state.sortDir = String(pair[1] || "desc").trim();
        state.page = 1;
        await reloadRows(root);
      });
    }

    if (importInput) {
      importInput.addEventListener("change", async () => {
        await handleImportFile(importInput, root);
      });
    }
  }

  async function open() {
    if (dialogOpen && getActiveRoot()) return;

    await registerStyle();

    const result = await bridge.invokeCoreAction("ui.dialog.open", {
      dialogId,
      title: "Library Manager",
      html: createDialogMarkup(),
      closeOnBackdrop: true,
      closeOnEsc: true,
      size: "xl",
    });

    if (!result?.ok) {
      dialogOpen = false;
      await bridge.invokeCoreAction("toast.show", {
        message: `Library manager failed to open (${result?.reason || "unknown"}).`,
      });
      return;
    }

    const contentId = String(result?.value?.contentId || "").trim();
    dialogRoot = contentId ? document.getElementById(contentId) : null;
    dialogOpen = Boolean(dialogRoot);
    if (!dialogRoot) return;

    bindEvents(dialogRoot);
    syncLayoutState(dialogRoot);
    await reloadRows(dialogRoot);
    dialogRoot.querySelector(".f95ue-library-manager-window")?.focus();
  }

  async function close(reason = "addon-close") {
    if (!dialogOpen && !dialogRoot) {
      await unregisterStyle();
      return;
    }

    await bridge.invokeCoreAction("ui.dialog.close", {
      dialogId,
      reason,
    });
    dialogOpen = false;
    dialogRoot = null;
    await unregisterStyle();
  }

  async function handleDialogClosed(detail = {}) {
    if (String(detail.dialogId || "") !== dialogId) return;
    dialogOpen = false;
    dialogRoot = null;
    await unregisterStyle();
  }

  return {
    open,
    close,
    handleDialogClosed,
  };
}
