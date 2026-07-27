import { closeDialog, openDialog, updateDialog } from "../../api/ui/dialog.js";
import { registerStyle, unregisterStyle } from "../../api/ui/style.js";
import { showToast } from "../utils/showToast.js";
import { bindEntryEditor } from "./editorBindings.js";
import { getEntryEditorStyleText, renderEntryEditor } from "./editorRenderer.js";
import { createEditorDraft, validateEditorDraft } from "./editorValidation.js";
import { createActivityCommandId } from "../../library/activityCommandId.js";

export function createEntryEditorController({
  core,
  addonId,
  library,
  onSaved = () => {},
}) {
  const dialogId = `${addonId}-entry-editor`;
  const styleId = `${addonId}-entry-editor-style`;
  let generation = 0;
  let active = null;
  let unbind = () => {};

  function invalidate() {
    generation += 1;
    unbind();
    unbind = () => {};
    active = null;
  }

  function getRoot(contentId) {
    return contentId ? document.getElementById(contentId) : null;
  }

  async function renderActive(issues = []) {
    if (!active) return { ok: false, reason: "editor_closed" };
    const result = await updateDialog(
      core,
      dialogId,
      renderEntryEditor(
        active.record,
        active.draft,
        issues,
        active.updateEvents,
        active.activityEvents,
      ),
    );
    if (!result?.ok) return result;
    const root = getRoot(result.value?.contentId || active.contentId);
    if (!root) return { ok: false, reason: "dialog_content_missing" };
    active.contentId = result.value?.contentId || active.contentId;
    unbind();
    unbind = bindEntryEditor(root, {
      onSave: save,
      onCancel: () => close("cancel"),
      onAcknowledge: acknowledge,
      onPlayedVersion: playedVersion,
    });
    return result;
  }

  async function playedVersion(editorDraft = null) {
    if (!active) return { ok: false, reason: "editor_closed" };
    if (active.playingVersion) return { ok: false, reason: "already_in_progress" };
    active.playingVersion = true;
    const actionGeneration = generation;
    const threadId = active.threadId;
    const capturedDraft = editorDraft ? { ...editorDraft } : { ...active.draft };
    try {
      const result = await library.applyPersonalActivity(
        threadId,
        {},
        {
          commandId: createActivityCommandId("played-version"),
          playedCurrentVersion: true,
          shouldCancel: () => actionGeneration !== generation,
        },
      );
      if (actionGeneration !== generation || !active || active.threadId !== threadId) {
        return { ok: false, reason: "cancelled" };
      }
      if (!result?.ok) {
        await showToast(`Failed to record activity: ${result?.reason || "unknown"}`, "error");
        return result;
      }
      const refreshed = await library.getEntry(threadId);
      if (actionGeneration !== generation || !active || active.threadId !== threadId) {
        return { ok: false, reason: "cancelled" };
      }
      if (!refreshed) {
        await showToast("Library entry no longer exists.", "error");
        return { ok: false, reason: "entry_not_found" };
      }
      active.record = refreshed;
      const canonicalDraft = createEditorDraft(active.record);
      active.draft = {
        ...canonicalDraft,
        ...capturedDraft,
        lastPlayedVersion: canonicalDraft.lastPlayedVersion,
        lastPlayedAt: canonicalDraft.lastPlayedAt,
      };
      active.activityEvents = await library.listActivityEvents(active.threadId, 20);
      if (actionGeneration !== generation || !active) {
        return { ok: false, reason: "cancelled" };
      }
      await renderActive();
      await onSaved(result);
      return result;
    } finally {
      if (active && active.threadId === threadId) active.playingVersion = false;
    }
  }

  async function acknowledge(editorDraft = null) {
    if (!active) return { ok: false, reason: "editor_closed" };
    const actionGeneration = generation;
    const threadId = active.threadId;
    if (editorDraft) active.draft = { ...editorDraft };
    const result = await library.acknowledgeCurrentUpdate(threadId);
    if (actionGeneration !== generation || !active || active.threadId !== threadId) {
      return { ok: false, reason: "cancelled" };
    }
    if (!result?.ok) {
      await showToast(`Failed to acknowledge update: ${result?.reason || "unknown"}`, "error");
      return result;
    }
    active.record = await library.getEntry(threadId);
    if (actionGeneration !== generation || !active || active.threadId !== threadId) {
      return { ok: false, reason: "cancelled" };
    }
    if (!active.record) {
      await showToast("Library entry no longer exists.", "error");
      return { ok: false, reason: "entry_not_found" };
    }
    await renderActive();
    await onSaved(result);
    return result;
  }

  async function save(draft) {
    if (!active || active.saving) return { ok: false, reason: "editor_closed" };
    const saveGeneration = generation;
    const validation = validateEditorDraft(draft);
    active.draft = { ...draft };
    if (!validation.ok) {
      await renderActive(validation.issues);
      return { ok: false, reason: "invalid_editor", issues: validation.issues };
    }

    active.saving = true;
    const fresh = await library.getEntry(active.threadId);
    if (saveGeneration !== generation || !active) {
      return { ok: false, reason: "cancelled" };
    }
    if (!fresh) {
      active.saving = false;
      await showToast("Library entry no longer exists.", "error");
      return { ok: false, reason: "entry_not_found" };
    }

    const result = await library.applyPersonalActivity(
      active.threadId,
      validation.personal,
      {
        commandId: createActivityCommandId("editor-save"),
        shouldCancel: () => saveGeneration !== generation,
      },
    );
    if (saveGeneration !== generation || !active) {
      return { ok: false, reason: "cancelled" };
    }
    active.saving = false;
    if (!result?.ok) {
      await showToast(`Failed to save entry: ${result?.reason || "unknown"}`, "error");
      return result;
    }
    const autoResult =
      typeof library.setAutoUpdateEnabled === "function"
        ? await library.setAutoUpdateEnabled(
            [active.threadId],
            validation.autoUpdateEnabled,
          )
        : { ok: true };
    if (!autoResult?.ok || saveGeneration !== generation) {
      return { ok: false, reason: "auto_update_save_failed" };
    }
    await close("saved");
    await onSaved(result);
    return result;
  }

  async function open(threadId) {
    const id = String(threadId || "").trim();
    if (!id) return { ok: false, reason: "thread_id_required" };
    const openGeneration = ++generation;
    unbind();
    unbind = () => {};
    active = null;

    const record = await library.getEntry(id);
    if (openGeneration !== generation) return { ok: false, reason: "cancelled" };
    if (!record) return { ok: false, reason: "entry_not_found" };

    const updateEvents =
      typeof library.listUpdateEvents === "function"
        ? await library.listUpdateEvents(id, 20)
        : [];
    if (openGeneration !== generation) return { ok: false, reason: "cancelled" };
    const activityEvents =
      typeof library.listActivityEvents === "function"
        ? await library.listActivityEvents(id, 20)
        : [];
    if (openGeneration !== generation) return { ok: false, reason: "cancelled" };
    const draft = createEditorDraft(record);
    const styleResult = await registerStyle(core, styleId, getEntryEditorStyleText());
    if (!styleResult?.ok) return styleResult;
    if (openGeneration !== generation) {
      await unregisterStyle(core, styleId);
      return { ok: false, reason: "cancelled" };
    }

    const result = await openDialog(core, {
      dialogId,
      title: "Edit Library Entry",
      html: renderEntryEditor(record, draft, [], updateEvents, activityEvents),
      size: "lg",
      closeOnEsc: true,
      closeOnBackdrop: true,
    });
    if (!result?.ok || openGeneration !== generation) {
      await unregisterStyle(core, styleId);
      return result?.ok ? { ok: false, reason: "cancelled" } : result;
    }

    const contentId = String(result.value?.contentId || "");
    const root = getRoot(contentId);
    if (!root) {
      await closeDialog(core, dialogId, "content-missing");
      await unregisterStyle(core, styleId);
      return { ok: false, reason: "dialog_content_missing" };
    }
    active = {
      threadId: id,
      record,
      draft,
      updateEvents,
      activityEvents,
      contentId,
      saving: false,
    };
    unbind = bindEntryEditor(root, {
      onSave: save,
      onCancel: () => close("cancel"),
      onAcknowledge: acknowledge,
      onPlayedVersion: playedVersion,
    });
    return result;
  }

  async function close(reason = "addon-close") {
    const wasActive = Boolean(active);
    invalidate();
    const result = wasActive
      ? await closeDialog(core, dialogId, reason)
      : { ok: true, value: { alreadyClosed: true } };
    await unregisterStyle(core, styleId);
    return result;
  }

  async function handleDialogClosed(detail = {}) {
    if (String(detail.dialogId || "") !== dialogId) return false;
    invalidate();
    await unregisterStyle(core, styleId);
    return true;
  }

  return {
    open,
    close,
    save,
    handleDialogClosed,
    getSnapshot: () => ({
      dialogId,
      active: Boolean(active),
      threadId: active?.threadId || "",
      generation,
    }),
  };
}
