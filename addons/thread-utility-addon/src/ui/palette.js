import { buildTagView } from "../domain/tags/model.js";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderContentSection(state, id, title) {
  const section = state.content?.[id];
  if (!section?.available) return "";
  const open = state.ui.openContentSection === id;
  return `
    <section class="thread-utility-content-section" data-content-section="${id}">
      <div class="thread-utility-content-heading">
        <button
          type="button"
          class="thread-utility-content-disclosure"
          data-thread-utility-action="toggle-content"
          data-section-id="${id}"
          aria-controls="thread-utility-${id}-content"
          aria-expanded="${open ? "true" : "false"}"
        >${escapeHtml(title)} ${open ? "v" : ">"}</button>
      </div>
      ${open
        ? `<div id="thread-utility-${id}-content" class="thread-utility-content">${section.html}</div>`
        : ""}
      ${open && section.truncated
        ? '<span class="thread-utility-truncated">Content truncated</span>'
        : ""}
    </section>
  `;
}

function renderDownloads(state) {
  const items = Array.isArray(state.downloads) ? state.downloads : [];
  if (!items.length) return "";
  const open = state.ui.openContentSection === "downloads";
  const groups = new Map();
  for (const item of items) {
    const platform = String(item.platform || "Other").trim() || "Other";
    if (!groups.has(platform)) groups.set(platform, []);
    groups.get(platform).push(item);
  }
  const rows = open ? [...groups].map(([platform, entries]) => `
    <div class="thread-utility-download-group">
      <strong>${escapeHtml(platform)}:</strong>
      <div class="thread-utility-download-links">
        ${entries.map((item) => `
          <span class="thread-utility-download">
            <span class="thread-utility-download-label">${escapeHtml(item.label)}</span>
            <button type="button" data-download-action="open" data-download-id="${item.id}">Open</button>
            ${item.maskedDirectToken
              ? `<button type="button" data-download-action="delegate" data-download-id="${item.id}">${item.actionType === "direct" ? "Direct DL" : "Resolve"}</button>`
              : ""}
          </span>
        `).join('<span class="thread-utility-download-separator" aria-hidden="true">·</span>')}
      </div>
    </div>
  `).join("") : "";
  return `
    <section class="thread-utility-content-section">
      <div class="thread-utility-content-heading">
        <button type="button" class="thread-utility-content-disclosure"
          data-thread-utility-action="toggle-content" data-section-id="downloads"
          aria-controls="thread-utility-downloads-content" aria-expanded="${open ? "true" : "false"}"
        >Downloads (${items.length}) ${open ? "v" : ">"}</button>
      </div>
      ${open ? `<div id="thread-utility-downloads-content">${rows}</div>` : ""}
    </section>
  `;
}

function renderSummary(snapshot) {
  if (!snapshot) {
    return `
      <header class="thread-utility-summary thread-utility-summary--empty">
        <div><h2>Thread summary unavailable</h2></div>
      </header>
    `;
  }
  const prefixes = (snapshot.prefixes || []).map((prefix) =>
    `<span class="thread-utility-prefix">${escapeHtml(prefix)}</span>`).join("");
  const facts = [
    snapshot.version ? `<span><b>Version</b> ${escapeHtml(snapshot.version)}</span>` : "",
    snapshot.developer ? `<span><b>Developer</b> ${escapeHtml(snapshot.developer)}</span>` : "",
    Number.isFinite(snapshot.rating)
      ? `<span><b>Rating</b> ${escapeHtml(snapshot.rating)}</span>`
      : "<span><b>Rating</b> -</span>",
  ].filter(Boolean).join("");
  return `
    <header class="thread-utility-summary">
      <div class="thread-utility-summary-main">
        <div class="thread-utility-prefixes">${prefixes}</div>
        <div class="thread-utility-title-row">
          <h2>${escapeHtml(snapshot.title || "Untitled thread")}</h2>
          <div class="thread-utility-title-actions" aria-label="Thread copy actions">
            <button type="button" data-thread-utility-action="run-utility"
              data-utility-id="copy-title" title="Copy title" aria-label="Copy title">⧉</button>
            <button type="button" data-thread-utility-action="run-utility"
              data-utility-id="copy-thread-link" title="Copy link" aria-label="Copy link">🔗</button>
          </div>
        </div>
        <div class="thread-utility-facts">${facts || "<span>Thread details unavailable</span>"}</div>
      </div>
    </header>
  `;
}

function renderStatus(state) {
  const status = String(state.ui.paletteStatus || "ready");
  if (status === "ready" || status === "idle") return "";
  return `
    <div class="thread-utility-status thread-utility-status--${escapeHtml(status)}"
      role="${status === "failure" ? "alert" : "status"}">
      ${status === "loading" ? '<span class="thread-utility-spinner" aria-hidden="true"></span>' : ""}
      ${escapeHtml(state.ui.paletteMessage || "Thread details are unavailable.")}
    </div>
  `;
}

export function renderPalette(state) {
  const view = buildTagView(state.displayTags, {
    expanded: state.ui.tagsExpanded,
    visibleTagLimit: state.settings.visibleTagLimit,
  });
  const chips = view.tags.map((tag) => `
    <span class="thread-utility-tag thread-utility-tag--${tag.status}">
      ${escapeHtml(tag.label)}
    </span>
  `).join("");
  const toggle = view.overflow > 0
    ? `
      <button
        type="button"
        class="thread-utility-tag-toggle"
        data-thread-utility-action="toggle-tags"
        aria-controls="thread-utility-tags"
        aria-expanded="${view.expanded ? "true" : "false"}"
      >${view.expanded ? "Show less" : `+${view.hiddenCount}`}</button>
    `
    : "";
  const utilities = Array.isArray(state.utilities) ? state.utilities : [];
  const titleUtilityIds = new Set(["copy-title", "copy-thread-link"]);
  const fixedUtilities = utilities
    .filter((utility) => utility.family === "fixed" && !titleUtilityIds.has(utility.id))
    .map((utility) => `
      <button type="button" class="thread-utility-action"
        data-thread-utility-action="run-utility"
        data-utility-id="${escapeHtml(utility.id)}"
      >${escapeHtml(utility.label)}</button>
    `).join("");
  const quickSearches = utilities
    .filter((utility) => utility.family === "quick-search")
    .map((utility) => `
      <button
        type="button"
        class="thread-utility-action thread-utility-action--search"
        data-thread-utility-action="run-utility"
        data-utility-id="${escapeHtml(utility.id)}"
      >${escapeHtml(utility.label)}</button>
    `).join("");
  const description = renderContentSection(state, "description", "Description");
  const installation = renderContentSection(state, "installation", "Installation");
  const downloads = renderDownloads(state);
  return `
    <section class="thread-utility-palette" data-role="threadUtilityPalette">
      ${renderSummary(state.snapshot)}
      <div class="thread-utility-scroll" data-preserve-scroll="palette">
        ${renderStatus(state)}
        <div id="thread-utility-tags" class="thread-utility-tags" aria-label="Thread tags">
          ${chips || '<span class="thread-utility-tags-empty">No thread tags</span>'}
          ${toggle}
        </div>
        <div class="thread-utility-utility-grid" aria-label="Thread utilities">
          ${fixedUtilities}
          ${quickSearches}
        </div>
        <div class="thread-utility-content-sections">
          ${description}
          ${installation}
          ${downloads}
        </div>
      </div>
      <footer class="thread-utility-footer">
        <button type="button" data-thread-utility-footer-action="refresh">Refresh</button>
        <button type="button" data-thread-utility-footer-action="settings">Settings</button>
      </footer>
    </section>
  `;
}
