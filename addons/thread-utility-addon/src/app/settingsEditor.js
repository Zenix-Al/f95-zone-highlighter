import { closeDialog, openDialog, updateDialog } from "../api/ui/dialog.js";
import { setStoredValue } from "../api/storage.js";
import {
  THREAD_UTILITY_SETTINGS_DIALOG_ID,
  THREAD_UTILITY_SETTINGS_KEY,
} from "../constants.js";
import {
  addDraftUtility,
  createSettingsDraft,
  deleteDraftUtility,
  moveDraftUtility,
  resetSettingsDraft,
  validateSettingsDraft,
} from "../domain/settings/model.js";
import { renderSettingsDialog } from "../ui/settingsDialog.js";

export function createThreadUtilitySettingsEditor({
  core,
  getSettings,
  onSaved,
  documentObject = globalThis.document,
}) {
  let active = null;
  let clickHandler = null;

  function capture() {
    const root = documentObject.querySelector('[data-role="threadUtilitySettings"]');
    if (!root || !active) return;
    active.draft.searchScope = root.elements.searchScope?.value || "thread";
    active.draft.excludedTagMode = root.elements.excludedTagMode?.value || "muted";
    active.draft.quickSearches = [...root.querySelectorAll("[data-settings-index]")]
      .filter((row) => row.matches("fieldset"))
      .map((row, order) => ({
        id: row.elements.id?.value || `custom-${order + 1}`,
        label: row.elements.label?.value || "",
        query: row.elements.query?.value || "",
        includeTitle: Boolean(row.elements.includeTitle?.checked),
        enabled: Boolean(row.elements.enabled?.checked),
        order,
      }));
  }

  async function render() {
    if (!active) return { ok: false, reason: "unavailable" };
    return updateDialog(
      core,
      THREAD_UTILITY_SETTINGS_DIALOG_ID,
      renderSettingsDialog(active.draft, active.error),
    );
  }

  function unbind() {
    if (!clickHandler) return;
    documentObject.removeEventListener("click", clickHandler, true);
    documentObject.removeEventListener("submit", clickHandler, true);
    clickHandler = null;
  }

  async function close(reason = "addon-request") {
    if (!active) return { ok: true };
    unbind();
    active = null;
    return closeDialog(core, THREAD_UTILITY_SETTINGS_DIALOG_ID, reason);
  }

  async function save() {
    capture();
    const session = active;
    const validation = validateSettingsDraft(active?.draft);
    if (!validation.ok) {
      active.error = "Complete every utility label and query before saving.";
      await render();
      return validation;
    }
    const next = { ...getSettings(), ...validation.value };
    const result = await setStoredValue(core, THREAD_UTILITY_SETTINGS_KEY, next);
    if (active !== session) return { ok: false, reason: "stale_generation" };
    if (!result?.ok) {
      active.error = "Settings could not be saved. Your draft is still open.";
      await render();
      return result;
    }
    await close("settings-saved");
    await onSaved();
    return result;
  }

  function bind() {
    if (clickHandler) return;
    clickHandler = (event) => {
      const form = event.target?.closest?.('[data-role="threadUtilitySettings"]');
      const button = event.type === "submit"
        ? form?.querySelector('[data-settings-action="save"]')
        : event.target?.closest?.("[data-settings-action]");
      if (!button?.closest?.('[data-role="threadUtilitySettings"]') || !active) return;
      event.preventDefault();
      capture();
      const action = String(button.dataset.settingsAction || "");
      const index = Number(button.dataset.settingsIndex);
      if (action === "save") void save();
      else if (action === "cancel") void close("settings-cancel");
      else {
        if (action === "add") addDraftUtility(active.draft);
        if (action === "reset") active.draft = resetSettingsDraft();
        if (action === "delete") deleteDraftUtility(active.draft, index);
        if (action === "move-up") moveDraftUtility(active.draft, index, -1);
        if (action === "move-down") moveDraftUtility(active.draft, index, 1);
        active.error = "";
        void render();
      }
    };
    documentObject.addEventListener("click", clickHandler, true);
    documentObject.addEventListener("submit", clickHandler, true);
  }

  async function open() {
    if (active) return { ok: true, value: { alreadyOpen: true } };
    const session = { draft: createSettingsDraft(getSettings()), error: "" };
    active = session;
    const result = await openDialog(core, {
      dialogId: THREAD_UTILITY_SETTINGS_DIALOG_ID,
      title: "Thread Utility Settings",
      html: renderSettingsDialog(session.draft),
      size: "lg",
    });
    if (active !== session) {
      if (result?.ok) {
        await closeDialog(core, THREAD_UTILITY_SETTINGS_DIALOG_ID, "stale-dialog-open");
      }
      return { ok: false, reason: "stale_generation" };
    }
    if (!result?.ok) {
      active = null;
      return result;
    }
    bind();
    return result;
  }

  function handleClosed() {
    unbind();
    active = null;
  }

  return {
    close,
    getDraft: () => active?.draft || null,
    handleClosed,
    open,
    save,
  };
}
