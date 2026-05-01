/**
 * Rendering functions for UI components
 * Responsible for generating HTML and updating DOM
 */

import { escapeHtml } from "../../../shared/htmlUtils.js";
import { fmtDate, safeText, getThreadDiffSummary } from "./helpers.js";
import { LIBRARY_MANAGER_PAGE_SIZE } from "../constants.js";

function renderChipList(items, { limit = 6, kind = "", emptyText = "-" } = {}) {
  const normalized = Array.isArray(items)
    ? items.map((item) => safeText(item)).filter(Boolean)
    : [];
  if (normalized.length === 0) return emptyText;

  const hiddenCount = Math.max(0, normalized.length - limit);
  const title = escapeHtml(normalized.join(", "));
  const chips = normalized
    .map((label, index) => {
      const overflowClass = index >= limit ? " is-overflow" : "";
      return `<span class="f95ue-chip${overflowClass}" data-kind="${escapeHtml(kind)}">${escapeHtml(label)}</span>`;
    })
    .join("");

  const countChip =
    hiddenCount > 0
      ? `<span class="f95ue-chip f95ue-chip--count" data-kind="${escapeHtml(kind)}">+${hiddenCount}</span>`
      : "";

  return `<div class="f95ue-chip-list" data-kind="${escapeHtml(kind)}" title="${title}" tabindex="0">${chips}${countChip}</div>`;
}

export function renderRows(tbody, rows = [], selectedIds = new Set(), activeId = "") {
  tbody.innerHTML = rows
    .map((entry) => {
      const tagsHtml = renderChipList(entry.tags, { limit: 6, kind: "tag" });

      const statusValueRaw = safeText(entry.userStatus) || "saved";
      const statusValue = String(statusValueRaw).trim() || "saved";
      const statusKey = statusValue.toLowerCase();
      const statusChip = `<span class="f95ue-chip f95ue-chip--status" data-status="${escapeHtml(statusKey)}">${escapeHtml(statusValue)}</span>`;

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
          <td>${statusChip}</td>
          <td>${userScore}</td>
          <td>${fmtDate(entry.updatedAt)}</td>
          <td>${escapeHtml(gameVersion)}</td>
          <td>${tagsHtml}</td>
          <td>
            <button type="button" data-action="remove" data-thread-id="${entry.threadId}">Remove</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

export function renderDetailPanel(root, state, getActiveEntry, getLiveThreadSnapshot) {
  if (!root) return;
  const panel = root.querySelector('[data-role="detail"]');
  if (!panel) return;

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

export function syncLayoutState(root, state) {
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

export function updatePageInfo(root, state) {
  const pageInfo = root.querySelector('[data-role="pageInfo"]');
  const selectedInfo = root.querySelector('[data-role="selectedInfo"]');
  const toggleAll = root.querySelector('[data-action="toggle-all"]');

  if (pageInfo) {
    const maxPage = Math.max(1, Math.ceil(state.rows.length / LIBRARY_MANAGER_PAGE_SIZE));
    pageInfo.textContent = `Page ${state.page} / ${maxPage} (${state.rows.length} rows)`;
  }

  if (selectedInfo) {
    selectedInfo.textContent = `${state.selectedIds.size} selected`;
  }

  if (toggleAll) {
    const from = (state.page - 1) * LIBRARY_MANAGER_PAGE_SIZE;
    const pageRows = state.rows.slice(from, from + LIBRARY_MANAGER_PAGE_SIZE);
    const pageIds = pageRows.map((row) => row.threadId);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => state.selectedIds.has(id));
    toggleAll.checked = allSelected;
  }
}

export function updateStatusLine(root, state, ROWS_STATUS_ID) {
  const statusLine = root.querySelector(`#${ROWS_STATUS_ID}`);
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
}
