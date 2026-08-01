import { closeDialog, openDialog, updateDialog } from "../api/ui/dialog.js";
import { removeDockButtons, setDockButtons } from "../api/ui/dock.js";
import { registerStyle, unregisterStyle } from "../api/ui/style.js";
import {
  THREAD_UTILITY_DIALOG_ID,
  THREAD_UTILITY_STYLE_ID,
} from "../constants.js";
import { renderPalette } from "../ui/palette.js";
import threadUtilityCss from "../ui/threadUtility.css";

export function createThreadUtilityUiController({
  core,
  state,
  bindings,
  isTerminal,
}) {
  async function ensureStyle() {
    if (state.ui.styleRegistered) return { ok: true };
    const result = await registerStyle(core, THREAD_UTILITY_STYLE_ID, threadUtilityCss);
    if (!result?.ok) throw new Error(`Style registration failed: ${result?.reason || "unknown"}`);
    state.ui.styleRegistered = true;
    return result;
  }

  async function mountLauncher() {
    if (state.ui.launcherMounted) return { ok: true };
    const result = await setDockButtons(core, [{
      id: "open-palette",
      label: "Thread Utility",
      title: "Open compact thread information and utilities",
    }]);
    if (!result?.ok) throw new Error(`Launcher mount failed: ${result?.reason || "unknown"}`);
    state.ui.launcherMounted = true;
    return result;
  }

  async function openPalette({ generation, isCurrent = () => true } = {}) {
    if (!state.enabled || isTerminal() || !isCurrent()) {
      return { ok: false, reason: "unavailable" };
    }
    if (state.ui.dialogOpen) return { ok: true, value: { alreadyOpen: true } };
    state.ui.dialogOpening = true;
    state.ui.dialogGeneration = generation;
    state.ui.tagsExpanded = false;
    state.ui.openContentSection = null;
    try {
      const result = await openDialog(core, {
        dialogId: THREAD_UTILITY_DIALOG_ID,
        title: "Thread Utility",
        html: renderPalette(state),
        size: "lg",
      });
      if (!result?.ok) return result;
      if (!isCurrent() || state.ui.dialogGeneration !== generation) {
        await closeDialog(core, THREAD_UTILITY_DIALOG_ID, "stale-dialog-open");
        return { ok: false, reason: "stale_generation" };
      }
      state.ui.dialogOpen = true;
      bindings.bindDialogEvents();
      return result;
    } finally {
      if (state.ui.dialogGeneration === generation) state.ui.dialogOpening = false;
    }
  }

  async function updatePalette(generation = state.ui.dialogGeneration) {
    if (
      !state.ui.dialogOpen
      || isTerminal()
      || generation !== state.ui.dialogGeneration
    ) {
      return { ok: false, reason: "stale_generation" };
    }
    const result = await updateDialog(
      core,
      THREAD_UTILITY_DIALOG_ID,
      renderPalette(state),
    );
    if (
      !result?.ok
      || generation !== state.ui.dialogGeneration
      || !state.ui.dialogOpen
    ) {
      return result?.ok ? { ok: false, reason: "stale_generation" } : result;
    }
    bindings.rebindDialogEvents?.();
    return result;
  }

  async function enable({ isCurrent = () => true } = {}) {
    try {
      await ensureStyle();
      if (!isCurrent()) {
        await disable("stale-enable");
        return { ok: false, reason: "stale_generation" };
      }
      if (state.settings.showLauncher && !state.ui.launcherMounted) {
        await mountLauncher();
      } else if (!state.settings.showLauncher && state.ui.launcherMounted) {
        await removeDockButtons(core);
        state.ui.launcherMounted = false;
      }
      if (!isCurrent()) {
        await disable("stale-enable");
        return { ok: false, reason: "stale_generation" };
      }
      return { ok: true };
    } catch (error) {
      await disable("enable-rollback");
      throw error;
    }
  }

  async function disable(reason = "disable") {
    state.ui.dialogGeneration = null;
    state.ui.dialogOpening = false;
    if (state.ui.dialogOpen) {
      await closeDialog(core, THREAD_UTILITY_DIALOG_ID, reason);
    }
    state.ui.dialogOpen = false;
    state.ui.tagsExpanded = false;
    state.ui.openContentSection = null;
    bindings.unbindDialogEvents();
    if (state.ui.launcherMounted) {
      await removeDockButtons(core);
      state.ui.launcherMounted = false;
    }
    if (state.ui.styleRegistered) {
      await unregisterStyle(core, THREAD_UTILITY_STYLE_ID);
      state.ui.styleRegistered = false;
    }
  }

  function handleDialogClosed() {
    state.ui.dialogGeneration = null;
    state.ui.dialogOpening = false;
    state.ui.dialogOpen = false;
    state.ui.tagsExpanded = false;
    state.ui.openContentSection = null;
    bindings.unbindDialogEvents();
  }

  async function closePalette(reason = "addon-request") {
    state.ui.dialogGeneration = null;
    state.ui.dialogOpening = false;
    if (state.ui.dialogOpen) {
      await closeDialog(core, THREAD_UTILITY_DIALOG_ID, reason);
    }
    state.ui.dialogOpen = false;
    state.ui.tagsExpanded = false;
    state.ui.openContentSection = null;
    bindings.unbindDialogEvents();
  }

  async function toggleTags() {
    if (!state.ui.dialogOpen || isTerminal()) return { ok: false, reason: "unavailable" };
    const previous = state.ui.tagsExpanded;
    state.ui.tagsExpanded = !previous;
    const result = await updatePalette();
    if (!result?.ok) state.ui.tagsExpanded = previous;
    return result;
  }

  async function toggleContentSection(sectionId) {
    const id = ["description", "installation", "downloads"].includes(sectionId)
      ? sectionId
      : "";
    const available = id === "downloads"
      ? state.downloads?.length > 0
      : state.content?.[id]?.available;
    if (!id || !available || !state.ui.dialogOpen || isTerminal()) {
      return { ok: false, reason: "unavailable" };
    }
    const previous = state.ui.openContentSection;
    state.ui.openContentSection = previous === id ? null : id;
    const result = await updatePalette();
    if (!result?.ok) state.ui.openContentSection = previous;
    return result;
  }

  return {
    closePalette,
    disable,
    enable,
    handleDialogClosed,
    openPalette,
    toggleContentSection,
    toggleTags,
    updatePalette,
  };
}
