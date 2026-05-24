/**
 * Rendering functions for UI components
 * Responsible for generating HTML and updating DOM
 */

import { escapeHtml } from "../../../shared/htmlUtils.js";
import { fmtDate, safeText } from "./helpers.js";
import { LIBRARY_MANAGER_PAGE_SIZE } from "../constants.js";

const NOTE_MAX_LEN = 20000;

function renderChipList(
  items,
  { limit = 6, kind = "", emptyText = "-", tooltip = false, tooltipTitle = "" } = {},
) {
  const normalized = Array.isArray(items)
    ? items
        .map((item) => {
          if (!item) return null;
          if (typeof item === "string") {
            const label = safeText(item);
            return label ? { label, color: "", state: "", bg: "", fg: "" } : null;
          }
          if (typeof item === "object") {
            const label = safeText(item.label);
            if (!label) return null;
            const color = safeText(item.color);
            const state = safeText(item.state);
            const bg = safeText(item.bg);
            const fg = safeText(item.fg);
            return { label, color, state, bg, fg };
          }
          return null;
        })
        .filter(Boolean)
    : [];
  if (normalized.length === 0) return emptyText;

  const title = escapeHtml(normalized.map((item) => item.label).join(", "));
  const tooltipLabel = escapeHtml(tooltipTitle || title);

  const visible = normalized.slice(0, Math.max(0, Number(limit) || 0));
  const hiddenCount = Math.max(0, normalized.length - visible.length);

  const chipMarkup = (item) => {
    const colorAttr = item.color ? ` data-color="${escapeHtml(item.color)}"` : "";
    const stateAttr = item.state ? ` data-state="${escapeHtml(item.state)}"` : "";
    const styleAttr =
      item.bg || item.fg
        ? ` style="${item.bg ? `background:${escapeHtml(item.bg)};` : ""}${item.fg ? `color:${escapeHtml(item.fg)};` : ""}${item.bg ? `border-color:${escapeHtml(item.bg)};` : ""}"`
        : "";
    return `<span class="f95ue-chip" data-kind="${escapeHtml(kind)}"${colorAttr}${stateAttr}${styleAttr}>${escapeHtml(item.label)}</span>`;
  };

  const chips = visible.map((item) => chipMarkup(item)).join("");

  const countChip =
    hiddenCount > 0
      ? `<span class="f95ue-chip f95ue-chip--count" data-kind="${escapeHtml(kind)}">+${hiddenCount}</span>`
      : "";

  const tooltipMarkup =
    tooltip && hiddenCount > 0
      ? `<div class="f95ue-chip-tooltip" role="tooltip" aria-label="${tooltipLabel}">${normalized
          .map((item) => chipMarkup(item))
          .join("")}</div>`
      : "";

  const titleAttr = tooltip ? "" : ` title="${title}"`;
  return `<div class="f95ue-chip-list" data-kind="${escapeHtml(kind)}"${titleAttr} tabindex="0">${chips}${countChip}${tooltipMarkup}</div>`;
}

function renderHoverText(value, { limit = 42 } = {}) {
  const raw = safeText(value);
  if (!raw) return "-";

  const normalized = raw.replace(/\s+/g, " ").trim();
  const shouldTruncate = normalized.length > limit;
  const preview = shouldTruncate ? `${normalized.slice(0, limit)}…` : normalized;
  const tooltip = `<div class="f95ue-hover-tooltip" role="tooltip">${escapeHtml(raw)}</div>`;

  return `<span class="f95ue-hover-text" tabindex="0"><span class="f95ue-hover-preview">${escapeHtml(preview)}</span>${tooltip}</span>`;
}

function renderInlineStatusCell(entry, state) {
  const statusValueRaw = safeText(entry.userStatus) || "saved";
  const statusValue = String(statusValueRaw).trim() || "saved";
  const statusKey = statusValue.toLowerCase();
  const threadId = escapeHtml(entry.threadId);
  const isOpen = Boolean(state?.openStatusMenuId && state.openStatusMenuId === entry.threadId);

  const statusChip = `<span class="f95ue-chip f95ue-chip--status" data-status="${escapeHtml(statusKey)}">${escapeHtml(statusValue)}</span>`;
  return `
    <div class="f95ue-status-field ${isOpen ? "is-open" : ""}" data-thread-id="${threadId}">
      <button type="button" class="f95ue-status-trigger" data-action="status-menu-toggle" data-thread-id="${threadId}" title="Change status" aria-label="Change status">
        ${statusChip}
        <span class="f95ue-status-caret" aria-hidden="true">▾</span>
      </button>
      <div class="f95ue-status-menu" role="menu" aria-label="Change status">
        <button type="button" class="f95ue-status-option" data-action="set-status" data-thread-id="${threadId}" data-value="saved">saved</button>
        <button type="button" class="f95ue-status-option" data-action="set-status" data-thread-id="${threadId}" data-value="playing">playing</button>
        <button type="button" class="f95ue-status-option" data-action="set-status" data-thread-id="${threadId}" data-value="completed">completed</button>
        <button type="button" class="f95ue-status-option" data-action="set-status" data-thread-id="${threadId}" data-value="dropped">dropped</button>
      </div>
    </div>
  `.trim();
}

function renderDeveloperCell(entry) {
  const developer = safeText(entry.developer) || "-";
  if (!developer || developer === "-") return "-";
  const chip = renderChipList([developer], { limit: 1, kind: "developer" });
  return `
    <div class="f95ue-copy-wrap">
      ${chip}
      <button type="button" class="f95ue-copy-icon" data-action="copy-developer" data-copy-text="${escapeHtml(developer)}" title="Copy developer" aria-label="Copy developer">⧉</button>
    </div>
  `.trim();
}

function renderInlineNoteCell(entry, state) {
  const threadId = safeText(entry.threadId);
  const isEditing = state?.editingNoteId && state.editingNoteId === threadId;
  if (!threadId) return "-";

  if (isEditing) {
    const draft =
      state?.noteDraftById && typeof state.noteDraftById.get === "function"
        ? String(state.noteDraftById.get(threadId) ?? entry.note ?? "")
        : String(entry.note ?? "");

    return `
      <div class="f95ue-note-edit">
        <textarea
          class="f95ue-note-textarea"
          data-action="note-input"
          data-thread-id="${escapeHtml(threadId)}"
          maxlength="${NOTE_MAX_LEN}"
          rows="3"
        >${escapeHtml(draft)}</textarea>
        <button type="button" class="ghost f95ue-note-done" data-action="note-done" data-thread-id="${escapeHtml(threadId)}" title="Done">✔</button>
      </div>
    `.trim();
  }

  const notePreview = renderHoverText(entry.note, { limit: 46 });
  return `
    <div class="f95ue-note-view">
      ${notePreview}
      <button type="button" class="ghost f95ue-note-edit-btn" data-action="edit-note" data-thread-id="${escapeHtml(threadId)}" title="Edit note">✎</button>
    </div>
  `.trim();
}

export function renderRows(
  tbody,
  rows = [],
  selectedIds = new Set(),
  state = null,
  { tagItemsForEntry = null } = {},
) {
  tbody.innerHTML = rows
    .map((entry) => {
      const tagItems =
        typeof tagItemsForEntry === "function" ? tagItemsForEntry(entry) : entry.tags;
      const tagsHtml = renderChipList(tagItems, { limit: 6, kind: "tag", tooltip: true });
      const statusCell = renderInlineStatusCell(entry, state);

      const title = safeText(entry.title) || "Untitled";
      const titleHtml = `<a class="f95ue-table-link" href="${safeText(entry.url) || "#"}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>`;
      const gameVersion = safeText(entry.gameVersion) || "-";
      const prefixesHtml = renderChipList(entry.prefixes, {
        limit: 5,
        kind: "prefix",
        emptyText: "-",
      });
      const versionHtml =
        gameVersion && gameVersion !== "-"
          ? renderChipList([gameVersion], { limit: 1, kind: "version" })
          : "-";
      const developerHtml = renderDeveloperCell(entry);
      const threadRating = Number.isFinite(Number(entry.threadRating))
        ? Number(entry.threadRating).toFixed(1)
        : "-";
      const noteHtml = renderInlineNoteCell(entry, state);
      const checked = selectedIds.has(entry.threadId) ? "checked" : "";
      const rowMenuOpen =
        state?.openRowMenuId && String(state.openRowMenuId) === String(entry.threadId);
      const canUpdate = Boolean(state?.liveThreadId && state.liveThreadId === entry.threadId);
      return `
        <tr data-thread-id="${entry.threadId}">
          <td>
            <input type="checkbox" data-action="toggle-select" data-thread-id="${entry.threadId}" ${checked} />
          </td>
          <td>${titleHtml}</td>
          <td>${statusCell}</td>
          <td>${threadRating}</td>
          <td>${fmtDate(entry.updatedAt)}</td>
          <td>${prefixesHtml}</td>
          <td>${versionHtml}</td>
          <td>${developerHtml}</td>
          <td>${tagsHtml}</td>
          <td>${noteHtml}</td>
          <td>
            <div class="f95ue-row-menu ${rowMenuOpen ? "is-open" : ""}">
              <button type="button" class="ghost f95ue-row-menu-trigger" data-action="row-menu-toggle" data-thread-id="${entry.threadId}" title="Actions" aria-label="Actions">⋮</button>
              <div class="f95ue-row-menu-panel" role="menu" aria-label="Row actions">
                <button type="button" class="f95ue-row-menu-item" data-action="row-update-thread" data-thread-id="${entry.threadId}" ${canUpdate ? "" : "disabled"}>Update</button>
                <button type="button" class="f95ue-row-menu-item danger" data-action="remove" data-thread-id="${entry.threadId}">Remove</button>
              </div>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

export function updatePageInfo(root, state) {
  const pageInfo = root.querySelector('[data-role="pageInfo"]');
  const selectedInfo = root.querySelector('[data-role="selectedInfo"]');
  const toggleAll = root.querySelector('[data-action="toggle-all"]');

  if (pageInfo) {
    const pageSize = Math.max(1, Number(state.pageSize || LIBRARY_MANAGER_PAGE_SIZE));
    const maxPage = Math.max(1, Math.ceil(state.rows.length / pageSize));
    pageInfo.textContent = `Page ${state.page} / ${maxPage} (${state.rows.length} rows)`;
  }

  if (selectedInfo) {
    selectedInfo.textContent = `${state.selectedIds.size} selected`;
  }

  if (toggleAll) {
    const pageSize = Math.max(1, Number(state.pageSize || LIBRARY_MANAGER_PAGE_SIZE));
    const from = (state.page - 1) * pageSize;
    const pageRows = state.rows.slice(from, from + pageSize);
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
