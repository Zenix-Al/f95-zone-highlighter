import editorCssTemplate from "./editor.css";
import { EDITOR_STATUSES } from "./editorValidation.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function field(label, control, wide = false) {
  return `<label class="f95ue-library-editor-field${wide ? " is-wide" : ""}"><span>${label}</span>${control}</label>`;
}

export function getEntryEditorStyleText(rootSelector = ".f95ue-library-entry-editor") {
  return editorCssTemplate.replaceAll("__ROOT__", rootSelector);
}

export function renderEntryEditor(
  record,
  draft,
  issues = [],
  updateEvents = [],
  activityEvents = [],
) {
  updateEvents = updateEvents.map((event) =>
    event?.type === "version"
      ? event
      : {
          ...event,
          previousVersion: "Thread details changed",
          version:
            Array.isArray(event?.fields) && event.fields.length
              ? event.fields.join(", ")
              : "metadata",
        },
  );
  const issuePaths = new Set(issues.map((issue) => issue.path));
  const invalid = (path) => (issuePaths.has(path) ? ' aria-invalid="true"' : "");
  const thread = record?.thread || {};
  const statusOptions = EDITOR_STATUSES.map(
    (value) =>
      `<option value="${value}"${value === draft.status ? " selected" : ""}>${value}</option>`,
  ).join("");

  return `
    <form class="f95ue-library-entry-editor" data-role="entry-editor" novalidate>
      <div class="f95ue-library-editor-facts">
        <strong class="f95ue-library-editor-title">${escapeHtml(thread.title || `Thread ${record?.threadId || ""}`)}</strong>
        <div class="f95ue-library-editor-fact-grid">
          <span><small>Current version</small>${escapeHtml(thread.currentVersion || "Unknown")}</span>
          <span><small>Public rating</small>${thread.threadRating ?? "Unrated"}</span>
          <span><small>Update state</small>${escapeHtml(record?.updateState || "unchecked")}</span>
        </div>
        ${
          record?.updateState === "changed"
            ? '<button type="button" data-editor-action="acknowledge-update">Acknowledge current update</button>'
            : ""
        }
        <div class="f95ue-library-editor-history">
          <small>Recent updates</small>
          ${
            updateEvents.length
              ? `<ul>${updateEvents
                  .map(
                    (event) =>
                      `<li>${escapeHtml(event.previousVersion || "?")} → ${escapeHtml(event.version || "?")} · ${escapeHtml(new Date(event.observedAt).toLocaleString())}</li>`,
                  )
                  .join("")}</ul>`
              : "<span>No observed updates.</span>"
          }
        </div>
        <button type="button" data-editor-action="played-version">Played this version</button>
        <div class="f95ue-library-editor-history">
          <small>Recent activity</small>
          ${
            activityEvents.length
              ? `<ul>${activityEvents
                  .map(
                    (event) =>
                      `<li>${escapeHtml(event.type)}${event.version ? ` · ${escapeHtml(event.version)}` : ""} · ${escapeHtml(new Date(event.occurredAt).toLocaleString())}</li>`,
                  )
                  .join("")}</ul>`
              : "<span>No personal activity.</span>"
          }
        </div>
      </div>
      <div class="f95ue-library-editor-grid">
        ${field("Status", `<select name="status"${invalid("personal.status")}>${statusOptions}</select>`)}
        ${field("My rating", `<input name="rating" type="number" min="0" max="5" step="0.5" value="${escapeHtml(draft.rating)}"${invalid("personal.rating")}>`)}
        ${field("Last played version", `<input name="lastPlayedVersion" maxlength="200" value="${escapeHtml(draft.lastPlayedVersion)}">`)}
        ${field("Started", `<input name="startedAt" type="date" value="${escapeHtml(draft.startedAt)}"${invalid("personal.startedAt")}>`)}
        ${field("Last played", `<input name="lastPlayedAt" type="date" value="${escapeHtml(draft.lastPlayedAt)}"${invalid("personal.lastPlayedAt")}>`)}
        ${field("Completed", `<input name="completedAt" type="date" value="${escapeHtml(draft.completedAt)}"${invalid("personal.completedAt")}>`)}
        ${field("Dropped", `<input name="droppedAt" type="date" value="${escapeHtml(draft.droppedAt)}"${invalid("personal.droppedAt")}>`)}
        ${field("Note", `<textarea name="note" maxlength="10000" rows="4">${escapeHtml(draft.note)}</textarea>`, true)}
        ${field("Progress note", `<textarea name="progressNote" maxlength="10000" rows="4">${escapeHtml(draft.progressNote)}</textarea>`, true)}
        ${field("Pinned", `<input name="pinned" type="checkbox"${draft.pinned ? " checked" : ""}> Keep this entry above unpinned entries`)}
        ${field("Auto update", `<input name="autoUpdateEnabled" type="checkbox"${draft.autoUpdateEnabled ? " checked" : ""}> Check this record automatically`)}
      </div>
      <p class="f95ue-library-editor-error" data-role="editor-error">${issues.length ? "Check the highlighted fields." : ""}</p>
      <div class="f95ue-library-editor-actions">
        <button type="button" data-editor-action="cancel">Cancel</button>
        <button type="submit" class="primary" data-editor-action="save">Save</button>
      </div>
    </form>
  `.trim();
}
