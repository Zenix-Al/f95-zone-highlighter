import { LIBRARY_MANAGER_PAGE_SIZE } from "../constants.js";

const MANAGER_OVERLAY_ID = "f95ue-library-manager-overlay";
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

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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
          <td><a href="${safeText(entry.url) || "#"}" target="_blank" rel="noopener noreferrer">${title}</a></td>
          <td>${safeText(entry.userStatus) || "saved"}</td>
          <td>${userScore}</td>
          <td>${fmtDate(entry.updatedAt)}</td>
          <td>${gameVersion}</td>
          <td title="${tags}">${tags || "-"}</td>
          <td>
            <button type="button" data-action="remove" data-thread-id="${entry.threadId}">Remove</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function buildManagerMarkup() {
  return `
    <div class="f95ue-library-manager-window" role="dialog" aria-modal="true" aria-label="Library Manager" tabindex="-1">
      <div class="f95ue-library-header">
        <div class="f95ue-library-title">Library Manager</div>
        <button type="button" data-action="close">Close</button>
      </div>
      <div class="f95ue-library-toast-stack" data-role="toastStack"></div>

      <div class="f95ue-library-toolbar">
        <div class="f95ue-library-search-wrap">
          <input type="search" placeholder="Search title, id, tags..." data-field="search" />
          <span
            class="f95ue-library-search-help"
            title="Advanced search: tag:ntr status:playing score>=8 pinned has:note id:123"
            >?</span
          >
        </div>
        <select data-field="status">
          <option value="all">All Status</option>
          <option value="saved">saved</option>
          <option value="playing">playing</option>
          <option value="completed">completed</option>
          <option value="dropped">dropped</option>
        </select>
        <select data-field="sort">
          <option value="updatedAt:desc">Updated (Newest)</option>
          <option value="updatedAt:asc">Updated (Oldest)</option>
          <option value="title:asc">Title (A-Z)</option>
          <option value="title:desc">Title (Z-A)</option>
        </select>
        <button type="button" class="ghost" data-action="toggle-detail" data-role="toggleDetail">Details</button>
      </div>

      <div class="f95ue-library-actions">
        <button type="button" data-action="export">Export</button>
        <button type="button" data-action="import">Import JSON</button>
        <details class="f95ue-library-more-actions">
          <summary>Advanced</summary>
          <div class="f95ue-library-more-grid">
            <label>
              <span>Export scope</span>
              <select data-field="exportScope">
                <option value="all">All Records</option>
                <option value="filtered">Filtered Rows</option>
              </select>
            </label>
            <button type="button" data-action="export-selected">Export Selected</button>
            <label>
              <span>Import policy</span>
              <select data-field="conflictPolicy">
                <option value="newer">Newer Wins</option>
                <option value="replace">Replace Existing</option>
                <option value="skip">Skip Existing</option>
              </select>
            </label>
          </div>
        </details>
        <input type="file" data-field="importFile" accept="application/json,.json" hidden />
      </div>

      <div class="f95ue-library-layout">
        <div class="f95ue-library-list-panel">
          <div class="f95ue-library-bulkbar">
            <label class="bulk-select-all"><input type="checkbox" data-action="toggle-all" /> All</label>
            <span data-role="selectedInfo">0 selected</span>
            <select data-field="bulkStatus">
              <option value="saved">saved</option>
              <option value="playing">playing</option>
              <option value="completed">completed</option>
              <option value="dropped">dropped</option>
            </select>
            <button type="button" data-action="bulk-set-status">Apply Status</button>
            <button type="button" class="danger" data-action="bulk-remove">Remove Selected</button>
            <button type="button" class="ghost" data-action="clear-selection">Clear</button>
          </div>

          <div class="f95ue-library-table-wrap">
            <div id="${ROWS_STATUS_ID}" class="f95ue-library-status-line"></div>
            <table>
              <thead>
                <tr>
                  <th class="col-check"></th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Rating</th>
                  <th>Updated</th>
                  <th>Version</th>
                  <th>Tags</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody data-role="rows"></tbody>
            </table>
          </div>
        </div>

        <aside class="f95ue-library-detail-panel" data-role="detail" aria-live="polite">
          <div class="detail-title">Details Editor</div>
          <div class="detail-empty">Select a row to edit note, status, score, and pin.</div>
        </aside>
      </div>

      <div class="f95ue-library-footer">
        <button type="button" data-action="prev">Prev</button>
        <span data-role="pageInfo">Page 1</span>
        <button type="button" data-action="next">Next</button>
      </div>
    </div>
  `;
}

function ensureManagerStyles() {
  if (document.getElementById("f95ue-library-manager-style")) return;

  const style = document.createElement("style");
  style.id = "f95ue-library-manager-style";
  style.textContent = `
    #${MANAGER_OVERLAY_ID} {
      position: fixed;
      inset: 0;
      z-index: 2147483001;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
      backdrop-filter: blur(3px);
    }
    .f95ue-library-manager-window {
      width: min(1320px, calc(100vw - 24px));
      height: calc(100vh - 28px);
      max-height: 920px;
      background: #191b1e;
      border: 1px solid #3f4043;
      border-radius: 10px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
      color: #f0f2f6;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      outline: none;
    }
    .f95ue-library-layout {
      flex: 1;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      min-height: 0;
    }
    .f95ue-library-manager-window.is-detail-open .f95ue-library-layout {
      grid-template-columns: 1.45fr minmax(280px, 0.95fr);
    }
    .f95ue-library-list-panel {
      display: flex;
      flex-direction: column;
      min-width: 0;
      border-right: 1px solid #2b2e33;
    }
    .f95ue-library-bulkbar {
      padding: 7px 10px;
      display: flex;
      gap: 6px;
      align-items: center;
      background: #1f2226;
      border-bottom: 1px solid #2b2e33;
      flex-wrap: wrap;
    }
    .f95ue-library-bulkbar [data-role="selectedInfo"] {
      margin-left: 2px;
      color: #adb9c7;
      font-size: 12px;
      min-width: 72px;
    }
    .f95ue-library-detail-panel {
      display: none;
      background: #17191d;
      border-left: 1px solid #2b2e33;
      padding: 10px;
      overflow: auto;
      min-width: 0;
    }
    .f95ue-library-manager-window.is-detail-open .f95ue-library-detail-panel {
      display: block;
    }
    .f95ue-library-detail-panel .detail-title {
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .detail-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }
    .detail-head .detail-title {
      margin-bottom: 0;
    }
    .detail-head button {
      padding: 4px 8px;
      font-size: 11px;
    }
    .f95ue-library-detail-panel .detail-empty {
      color: #9fa5ad;
      font-size: 13px;
      padding: 10px 0;
    }
    .detail-grid {
      display: grid;
      grid-template-columns: 90px 1fr;
      gap: 8px;
      align-items: center;
    }
    .detail-grid label {
      color: #c4c4c4;
      font-size: 12px;
    }
    .detail-grid input:not([type="checkbox"]), .detail-grid select, .detail-grid textarea {
      width: 100%;
      background: #222;
      border: 1px solid #555;
      border-radius: 4px;
      padding: 7px 8px;
      color: #fff;
      font-size: 12px;
    }
    .detail-grid input:not([type="checkbox"]):focus,
    .detail-grid select:focus,
    .detail-grid textarea:focus {
      outline: none;
      border-color: #c15858;
    }
    .detail-toggle {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: #d5d9de;
    }
    .detail-toggle input[type="checkbox"] {
      width: 16px;
      height: 16px;
      margin: 0;
      accent-color: #c15858;
      cursor: pointer;
      flex: 0 0 auto;
    }
    .detail-grid input[disabled],
    .detail-grid input[readonly],
    .detail-grid textarea[disabled],
    .detail-grid textarea[readonly] {
      background: #1a1d20;
      border-color: #3f4043;
      color: #9aa1aa;
      cursor: not-allowed;
    }
    .detail-grid input[disabled]::placeholder,
    .detail-grid textarea[disabled]::placeholder {
      color: #7e8690;
    }
    .detail-grid label:has(input[disabled]),
    .detail-grid label:has(input[readonly]) {
      color: #9aa1aa;
    }
    .detail-grid textarea {
      min-height: 90px;
      resize: vertical;
    }
    .detail-actions {
      display: flex;
      gap: 8px;
      margin-top: 10px;
      align-items: center;
      flex-wrap: wrap;
    }
    .detail-update-hint {
      font-size: 12px;
      color: #9fa5ad;
    }
    .f95ue-library-status-line {
      min-height: 20px;
      padding: 4px 10px;
      color: #b0b3b8;
      font-size: 12px;
      border-bottom: 1px solid #2b2e33;
      background: #1d2024;
    }
    .f95ue-library-status-line.error {
      color: #ff9898;
    }
    .col-check {
      width: 34px;
    }
    .f95ue-library-header, .f95ue-library-toolbar, .f95ue-library-actions, .f95ue-library-footer {
      padding: 9px 12px;
      display: flex;
      gap: 8px;
      align-items: center;
      background: #202329;
      border-bottom: 1px solid #2b2e33;
    }
    .f95ue-library-toolbar {
      flex-wrap: wrap;
    }
    .f95ue-library-search-wrap {
      position: relative;
      flex: 1;
      min-width: 220px;
    }
    .f95ue-library-search-wrap .f95ue-library-search-help {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 1px solid #555;
      color: #c5c7cb;
      font-size: 11px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: help;
      background: #1b1d20;
      user-select: none;
    }
    .f95ue-library-search-wrap .f95ue-library-search-help:hover {
      border-color: #893839;
      color: #fff;
      background: #893839;
    }
    .f95ue-library-footer {
      border-top: 1px solid #2b2e33;
      border-bottom: none;
      justify-content: center;
      background: #1d2024;
    }
    .f95ue-library-title {
      font-size: 15px;
      font-weight: 700;
      margin-right: auto;
    }
    .f95ue-library-toolbar input, .f95ue-library-toolbar select, .f95ue-library-actions select, .f95ue-library-bulkbar select {
      background: #222;
      border: 1px solid #555;
      color: #fff;
      border-radius: 4px;
      padding: 7px 9px;
    }
    .f95ue-library-search-wrap input {
      width: 100%;
      min-width: 0;
      padding-right: 30px;
    }
    .f95ue-library-toolbar input:focus,
    .f95ue-library-toolbar select:focus,
    .f95ue-library-actions select:focus,
    .f95ue-library-bulkbar select:focus {
      outline: none;
      border-color: #c15858;
    }
    .f95ue-library-toolbar select,
    .f95ue-library-actions select,
    .f95ue-library-bulkbar select,
    .detail-grid select {
      appearance: none;
      -webkit-appearance: none;
      -moz-appearance: none;
      background-image:
        linear-gradient(45deg, transparent 50%, #d6d8dd 50%),
        linear-gradient(135deg, #d6d8dd 50%, transparent 50%);
      background-position:
        calc(100% - 14px) calc(50% + 1px),
        calc(100% - 9px) calc(50% + 1px);
      background-size: 5px 5px, 5px 5px;
      background-repeat: no-repeat;
      padding-right: 24px;
    }
    .f95ue-library-table-wrap {
      flex: 1;
      overflow: auto;
      background: #191b1e;
    }
    .f95ue-library-table-wrap table {
      width: 100%;
      border-collapse: collapse;
      min-width: 820px;
    }
    .f95ue-library-table-wrap th, .f95ue-library-table-wrap td {
      border-bottom: 1px solid #31343a;
      padding: 8px 10px;
      text-align: left;
      vertical-align: middle;
      font-size: 12.5px;
    }
    .f95ue-library-table-wrap th {
      position: sticky;
      top: 0;
      background: #20242a;
      z-index: 1;
      font-weight: 700;
    }
    .f95ue-library-table-wrap tr:hover {
      background: rgba(137, 56, 57, 0.1);
    }
    .f95ue-library-table-wrap tr.is-active {
      background: rgba(137, 56, 57, 0.24);
    }
    .f95ue-library-manager-window button {
      border: 1px solid #893839;
      background: #893839;
      color: #fff;
      border-radius: 6px;
      padding: 6px 10px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      transition:
        background-color 0.2s ease,
        border-color 0.2s ease,
        color 0.2s ease,
        box-shadow 0.2s ease;
    }
    .f95ue-library-manager-window button:hover {
      background: #b94f4f;
      border-color: #b94f4f;
    }
    .f95ue-library-manager-window button.ghost {
      background: #222;
      border-color: #555;
      color: #fff;
    }
    .f95ue-library-manager-window button.danger {
      background: #893839;
      border-color: #893839;
    }
    .f95ue-library-more-actions {
      margin-left: auto;
      position: relative;
    }
    .f95ue-library-more-actions summary {
      list-style: none;
      cursor: pointer;
      border: 1px solid #555;
      border-radius: 6px;
      padding: 6px 10px;
      color: #fff;
      background: #222;
      user-select: none;
      font-size: 12px;
      font-weight: 600;
    }
    .f95ue-library-more-actions summary::-webkit-details-marker {
      display: none;
    }
    .f95ue-library-more-actions[open] summary {
      border-color: #b94f4f;
      background: #893839;
    }
    .f95ue-library-more-grid {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      z-index: 2;
      width: 260px;
      border: 1px solid #3f4043;
      border-radius: 8px;
      background: #191b1e;
      box-shadow: 0 12px 24px rgba(0, 0, 0, 0.35);
      padding: 8px;
      display: grid;
      gap: 8px;
    }
    .f95ue-library-more-grid label {
      display: grid;
      gap: 4px;
      font-size: 11px;
      color: #aab5c2;
    }
    .f95ue-library-toast-stack {
      position: absolute;
      top: 54px;
      right: 14px;
      z-index: 5;
      display: grid;
      gap: 8px;
      pointer-events: none;
    }
    .f95ue-library-toast {
      min-width: 220px;
      max-width: min(420px, 65vw);
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid #3f4043;
      background: #1b1e23;
      color: #e6e9ee;
      font-size: 12px;
      box-shadow: 0 8px 18px rgba(0, 0, 0, 0.3);
      opacity: 0;
      transform: translateY(-6px);
      transition:
        opacity 0.16s ease,
        transform 0.16s ease;
    }
    .f95ue-library-toast.show {
      opacity: 1;
      transform: translateY(0);
    }
    .f95ue-library-toast.error {
      border-color: rgba(183, 28, 28, 0.45);
      background: rgba(183, 28, 28, 0.18);
      color: #ffd1d1;
    }
    .f95ue-library-toast.success {
      border-color: rgba(56, 142, 60, 0.45);
      background: rgba(56, 142, 60, 0.2);
      color: #d8f2da;
    }
    .f95ue-library-confirm-backdrop {
      position: absolute;
      inset: 0;
      z-index: 20;
      background: rgba(0, 0, 0, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 14px;
    }
    .f95ue-library-confirm-panel {
      width: min(460px, 100%);
      background: #191b1e;
      border: 1px solid #3f4043;
      border-radius: 10px;
      padding: 12px;
      box-shadow: 0 16px 34px rgba(0, 0, 0, 0.4);
    }
    .f95ue-library-confirm-title {
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 8px;
      color: #f0f2f6;
    }
    .f95ue-library-confirm-message {
      white-space: pre-line;
      line-height: 1.5;
      color: #c5c7cb;
      font-size: 13px;
      margin-bottom: 10px;
    }
    .f95ue-library-confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    @media (max-width: 980px) {
      .f95ue-library-manager-window.is-detail-open .f95ue-library-layout {
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: minmax(210px, 1fr) minmax(180px, 0.8fr);
      }
      .f95ue-library-manager-window.is-detail-open .f95ue-library-detail-panel {
        border-left: none;
        border-top: 1px solid #2b2e33;
      }
      .f95ue-library-more-actions {
        margin-left: 0;
      }
      .f95ue-library-actions {
        flex-wrap: wrap;
      }
    }
  `;

  document.head.appendChild(style);
}

export function createLibraryManagerApp({ library, onMutated, getCurrentThreadSnapshot }) {
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

  function syncLayoutState(overlay) {
    const windowEl = overlay.querySelector(".f95ue-library-manager-window");
    const toggleBtn = overlay.querySelector('[data-role="toggleDetail"]');
    const shouldOpen = state.detailOpen;
    if (windowEl) {
      windowEl.classList.toggle("is-detail-open", shouldOpen);
    }
    if (toggleBtn) {
      toggleBtn.textContent = shouldOpen ? "Hide Details" : "Details";
      toggleBtn.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
    }
  }

  function showToast(overlay, message, type = "info") {
    const stack = overlay.querySelector('[data-role="toastStack"]');
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

  function askConfirm(
    overlay,
    {
      title = "Confirm",
      message = "Are you sure?",
      confirmText = "Confirm",
      cancelText = "Cancel",
      danger = false,
    } = {},
  ) {
    return new Promise((resolve) => {
      const existing = overlay.querySelector(".f95ue-library-confirm-backdrop");
      existing?.remove();

      const dialog = document.createElement("div");
      dialog.className = "f95ue-library-confirm-backdrop";
      dialog.innerHTML = `
        <div class="f95ue-library-confirm-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
          <div class="f95ue-library-confirm-title">${escapeHtml(title)}</div>
          <div class="f95ue-library-confirm-message">${escapeHtml(message)}</div>
          <div class="f95ue-library-confirm-actions">
            <button type="button" class="ghost" data-action="dialog-cancel">${escapeHtml(cancelText)}</button>
            <button type="button" ${danger ? 'class="danger"' : ""} data-action="dialog-confirm">${escapeHtml(confirmText)}</button>
          </div>
        </div>
      `;

      const finish = (value) => {
        dialog.remove();
        resolve(Boolean(value));
      };

      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) {
          finish(false);
          return;
        }
        const actionBtn = event.target?.closest?.("button[data-action]");
        if (!actionBtn) return;
        const action = String(actionBtn.dataset.action || "").trim();
        if (action === "dialog-cancel") finish(false);
        if (action === "dialog-confirm") finish(true);
      });

      dialog.addEventListener("keydown", (event) => {
        if (event.key === "Escape") finish(false);
      });

      overlay.appendChild(dialog);
      dialog.querySelector('[data-action="dialog-confirm"]')?.focus();
    });
  }

  function closeOverlay() {
    const existing = document.getElementById(MANAGER_OVERLAY_ID);
    if (existing?.parentNode) {
      existing.parentNode.removeChild(existing);
    }
  }

  async function reloadRows(overlay) {
    const statusLine = overlay.querySelector(`#${ROWS_STATUS_ID}`);
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

    const tbody = overlay.querySelector('[data-role="rows"]');
    const pageInfo = overlay.querySelector('[data-role="pageInfo"]');
    const selectedInfo = overlay.querySelector('[data-role="selectedInfo"]');
    const toggleAll = overlay.querySelector('[data-action="toggle-all"]');
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

    renderDetailPanel(overlay);
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

  function renderDetailPanel(overlay) {
    const panel = overlay.querySelector('[data-role="detail"]');
    if (!panel) return;

    syncLayoutState(overlay);

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
        <input type="text" data-field="detail-threadId" value="${entry.threadId}" disabled />

        <label>Title</label>
        <input type="text" data-field="detail-title" value="${safeText(entry.title)}" disabled />

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
        <input type="text" data-field="detail-gameVersion" value="${gameVersion}" disabled />

        <label>Pinned</label>
        <label class="detail-toggle"><input type="checkbox" data-field="detail-pinned" ${entry.pinned ? "checked" : ""} /> Pin this entry</label>

        <label>Tags</label>
        <input type="text" data-field="detail-tags" value="${tags}" disabled />

        <label>Note</label>
        <textarea data-field="detail-note">${safeText(entry.note)}</textarea>
      </div>
      <div class="detail-actions">
        <button type="button" data-action="detail-save">Save</button>
        <button type="button" data-action="detail-revert">Revert</button>
        ${canUpdateFromCurrentThread ? '<button type="button" class="ghost" data-action="detail-update-thread">Update from This Thread</button>' : ""}
        <span class="detail-update-hint">${updateHint}</span>
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

  async function handleImportFile(inputEl, overlay) {
    const file = inputEl?.files?.[0];
    if (!file) return;

    const text = await file.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      showToast(overlay, "Invalid JSON file.", "error");
      inputEl.value = "";
      return;
    }

    const records = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.records)
        ? parsed.records
        : [];

    const policyEl = overlay.querySelector('[data-field="conflictPolicy"]');
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

    const confirmed = await askConfirm(overlay, {
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
      overlay,
      `Import complete. Imported: ${result.imported}, skipped: ${result.skipped}.`,
      "success",
    );
    inputEl.value = "";

    await reloadRows(overlay);
    if (typeof onMutated === "function") onMutated();
  }

  function bindEvents(overlay) {
    const searchInput = overlay.querySelector('[data-field="search"]');
    const statusSelect = overlay.querySelector('[data-field="status"]');
    const sortSelect = overlay.querySelector('[data-field="sort"]');
    const importInput = overlay.querySelector('[data-field="importFile"]');
    const advancedPanel = overlay.querySelector(".f95ue-library-more-actions");
    let searchDebounceTimer = 0;

    overlay.addEventListener("click", async (event) => {
      const button = event.target?.closest?.("button[data-action]");
      if (!button) return;

      const action = String(button.dataset.action || "").trim();
      if (action === "close") {
        closeOverlay();
        return;
      }

      if (action === "toggle-detail") {
        state.detailOpen = !state.detailOpen;
        syncLayoutState(overlay);
        return;
      }

      if (action === "detail-close") {
        state.detailOpen = false;
        syncLayoutState(overlay);
        return;
      }

      if (action === "prev") {
        if (state.page > 1) {
          state.page -= 1;
          await reloadRows(overlay);
        }
        return;
      }

      if (action === "next") {
        const maxPage = Math.max(1, Math.ceil(state.rows.length / LIBRARY_MANAGER_PAGE_SIZE));
        if (state.page < maxPage) {
          state.page += 1;
          await reloadRows(overlay);
        }
        return;
      }

      if (action === "remove") {
        const threadId = String(button.dataset.threadId || "").trim();
        if (!threadId) return;
        const ok = await askConfirm(overlay, {
          title: "Remove Entry",
          message: "Remove this entry from library?",
          confirmText: "Remove",
          danger: true,
        });
        if (!ok) return;
        const result = await library.removeEntry(threadId);
        if (!result?.ok) {
          showToast(overlay, "Failed to remove entry.", "error");
          return;
        }
        showToast(overlay, "Entry removed from library.", "success");
        await reloadRows(overlay);
        if (typeof onMutated === "function") onMutated();
        return;
      }

      if (action === "clear-selection") {
        state.selectedIds = new Set();
        await reloadRows(overlay);
        return;
      }

      if (action === "bulk-set-status") {
        const ids = [...state.selectedIds];
        if (ids.length === 0) {
          showToast(overlay, "Select at least one row first.", "error");
          return;
        }
        const bulkStatusEl = overlay.querySelector('[data-field="bulkStatus"]');
        const nextStatus = String(bulkStatusEl?.value || "saved").trim();
        const result = await library.bulkUpdateStatus(ids, nextStatus);
        showToast(
          overlay,
          `Bulk status updated: ${result.updated}, skipped: ${result.skipped}.`,
          "success",
        );
        await reloadRows(overlay);
        if (typeof onMutated === "function") onMutated();
        return;
      }

      if (action === "bulk-remove") {
        const ids = [...state.selectedIds];
        if (ids.length === 0) {
          showToast(overlay, "Select at least one row first.", "error");
          return;
        }
        const ok = await askConfirm(overlay, {
          title: "Remove Selected",
          message: `Remove ${ids.length} selected entries? This cannot be undone.`,
          confirmText: "Remove",
          danger: true,
        });
        if (!ok) return;
        const result = await library.bulkRemoveEntries(ids);
        showToast(
          overlay,
          `Bulk removed: ${result.removed}, skipped: ${result.skipped}.`,
          "success",
        );
        state.selectedIds = new Set();
        await reloadRows(overlay);
        if (typeof onMutated === "function") onMutated();
        return;
      }

      if (action === "detail-save") {
        const entry = getActiveEntry();
        if (!entry) return;
        const statusField = overlay.querySelector('[data-field="detail-status"]');
        const scoreField = overlay.querySelector('[data-field="detail-userScore"]');
        const pinnedField = overlay.querySelector('[data-field="detail-pinned"]');
        const noteField = overlay.querySelector('[data-field="detail-note"]');

        const userScoreRaw = String(scoreField?.value || "").trim();
        const userScore = userScoreRaw ? Number(userScoreRaw) : null;
        if (userScoreRaw && (!Number.isFinite(userScore) || userScore < 0 || userScore > 10)) {
          showToast(overlay, "User score must be between 0 and 10.", "error");
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
          showToast(overlay, `Failed to save entry: ${result?.reason || "unknown"}`, "error");
          return;
        }

        state.detailOpen = false;
        showToast(overlay, "Entry saved.", "success");
        await reloadRows(overlay);
        if (typeof onMutated === "function") onMutated();
        return;
      }

      if (action === "detail-update-thread") {
        const entry = getActiveEntry();
        if (!entry) return;

        const snapshot = getLiveThreadSnapshot();
        if (!snapshot || snapshot.threadId !== entry.threadId) {
          showToast(overlay, "Update is only available on this entry's thread page.", "error");
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
          showToast(overlay, `Failed to update entry: ${result?.reason || "unknown"}`, "error");
          return;
        }

        showToast(overlay, "Entry refreshed from current thread.", "success");
        await reloadRows(overlay);
        if (typeof onMutated === "function") onMutated();
        return;
      }

      if (action === "detail-revert") {
        renderDetailPanel(overlay);
        return;
      }

      if (action === "export") {
        const scopeEl = overlay.querySelector('[data-field="exportScope"]');
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
          showToast(overlay, "Select at least one row first.", "error");
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

    overlay.addEventListener("change", async (event) => {
      const actionEl = event.target?.closest?.("input[data-action]");
      if (!actionEl) return;

      const action = String(actionEl.dataset.action || "").trim();
      if (action === "toggle-select") {
        const threadId = String(actionEl.dataset.threadId || "").trim();
        if (!threadId) return;
        if (actionEl.checked) state.selectedIds.add(threadId);
        else state.selectedIds.delete(threadId);
        await reloadRows(overlay);
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
        await reloadRows(overlay);
      }
    });

    overlay.addEventListener("click", async (event) => {
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
      renderDetailPanel(overlay);
      await reloadRows(overlay);
    });

    overlay.addEventListener("click", (event) => {
      if (
        advancedPanel?.hasAttribute("open") &&
        !event.target?.closest?.(".f95ue-library-more-actions")
      ) {
        advancedPanel.removeAttribute("open");
      }

      if (event.target === overlay) {
        closeOverlay();
      }
    });

    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeOverlay();
      }
    });

    if (searchInput) {
      searchInput.addEventListener("input", async () => {
        const nextSearch = String(searchInput.value || "").trim();
        if (searchDebounceTimer) {
          window.clearTimeout(searchDebounceTimer);
        }
        searchDebounceTimer = window.setTimeout(async () => {
          state.search = nextSearch;
          state.page = 1;
          await reloadRows(overlay);
        }, SEARCH_DEBOUNCE_MS);
      });
    }

    if (statusSelect) {
      statusSelect.addEventListener("change", async () => {
        state.status = String(statusSelect.value || "all").trim();
        state.page = 1;
        await reloadRows(overlay);
      });
    }

    if (sortSelect) {
      sortSelect.addEventListener("change", async () => {
        const pair = String(sortSelect.value || "updatedAt:desc").split(":");
        state.sortBy = String(pair[0] || "updatedAt").trim();
        state.sortDir = String(pair[1] || "desc").trim();
        state.page = 1;
        await reloadRows(overlay);
      });
    }

    if (importInput) {
      importInput.addEventListener("change", async () => {
        await handleImportFile(importInput, overlay);
      });
    }
  }

  async function open() {
    closeOverlay();
    ensureManagerStyles();

    const overlay = document.createElement("div");
    overlay.id = MANAGER_OVERLAY_ID;
    overlay.innerHTML = buildManagerMarkup();
    document.body.appendChild(overlay);

    const windowEl = overlay.querySelector(".f95ue-library-manager-window");
    windowEl?.focus();

    bindEvents(overlay);
    await reloadRows(overlay);
  }

  return {
    open,
    close: closeOverlay,
  };
}
