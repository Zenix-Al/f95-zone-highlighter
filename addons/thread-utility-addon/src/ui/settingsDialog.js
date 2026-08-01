function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderSettingsDialog(draft, error = "") {
  const rows = draft.quickSearches.map((utility, index) => `
    <fieldset class="thread-utility-settings-row" data-settings-index="${index}">
      <legend>Utility ${index + 1}</legend>
      <input type="hidden" name="id" value="${escapeHtml(utility.id)}">
      <label>Label
        <input name="label" maxlength="40" value="${escapeHtml(utility.label)}">
      </label>
      <label>Query
        <input name="query" maxlength="120" value="${escapeHtml(utility.query)}">
      </label>
      <label><input name="includeTitle" type="checkbox"${utility.includeTitle ? " checked" : ""}> Include thread title</label>
      <label><input name="enabled" type="checkbox"${utility.enabled ? " checked" : ""}> Enabled</label>
      <div class="thread-utility-settings-row-actions">
        <button type="button" data-settings-action="move-up" data-settings-index="${index}"${index === 0 ? " disabled" : ""}>Move up</button>
        <button type="button" data-settings-action="move-down" data-settings-index="${index}"${index === draft.quickSearches.length - 1 ? " disabled" : ""}>Move down</button>
        <button type="button" data-settings-action="delete" data-settings-index="${index}">Delete</button>
      </div>
    </fieldset>
  `).join("");
  return `
    <div class="thread-utility-settings-root">
      <div class="thread-utility-settings-window" role="document"
        aria-label="Thread Utility Settings" tabindex="-1">
        <form class="thread-utility-settings" data-role="threadUtilitySettings">
          ${error ? `<div class="thread-utility-settings-error" role="alert">${escapeHtml(error)}</div>` : ""}
          <div class="thread-utility-settings-options">
            <label>Search scope
              <select name="searchScope">
                <option value="thread"${draft.searchScope === "thread" ? " selected" : ""}>Current thread</option>
                <option value="global"${draft.searchScope === "global" ? " selected" : ""}>All forums</option>
              </select>
            </label>
            <label>Excluded tags
              <select name="excludedTagMode">
                <option value="muted"${draft.excludedTagMode === "muted" ? " selected" : ""}>Show muted</option>
                <option value="hidden"${draft.excludedTagMode === "hidden" ? " selected" : ""}>Hide</option>
              </select>
            </label>
          </div>
          <div class="thread-utility-settings-list">${rows || "<p>No quick utilities.</p>"}</div>
          <div class="thread-utility-settings-actions">
            <button type="button" data-settings-action="add">Add utility</button>
            <button type="button" data-settings-action="reset">Reset defaults</button>
            <span></span>
            <button type="button" data-settings-action="cancel">Cancel</button>
            <button type="submit" data-settings-action="save">Save</button>
          </div>
        </form>
      </div>
    </div>
  `;
}
