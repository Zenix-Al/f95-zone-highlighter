import { notifyTeardownComplete } from "../api/bridge.js";
import { getAddonAccess } from "../api/meta.js";
import { getPageContext } from "../api/page.js";
import { getTagPrefs } from "../api/storage.js";
import { createInitialState } from "../domain/state.js";
import { parseContentSections } from "../domain/content/parser.js";
import { createDownloadController } from "../domain/downloads/controller.js";
import { parseDownloads } from "../domain/downloads/parser.js";
import { captureThreadSnapshot } from "../domain/snapshot/parser.js";
import { createSnapshotSourceRegistry } from "../domain/snapshot/sourceRegistry.js";
import {
  buildDisplayTags,
  normalizeCoreTagPrefs,
} from "../domain/tags/model.js";
import { createUtilityController } from "../domain/utilities/controller.js";
import { createUtilityRegistry } from "../domain/utilities/registry.js";
import { createThreadUtilityBindings } from "../ui/bindings.js";
import { createThreadUtilityCommandController } from "./commands.js";
import { createThreadUtilityLifecycle } from "./lifecycle.js";
import { createThreadUtilityRegistration } from "./registration.js";
import { loadThreadUtilitySettings } from "./settings.js";
import { createThreadUtilitySettingsEditor } from "./settingsEditor.js";
import { createThreadUtilityUiController } from "./uiController.js";

export function createThreadUtilityApp({ core, runtime }) {
  const state = createInitialState();
  let terminal = false;
  let lifecycle = null;
  let ui = null;
  let utilityController = null;
  let downloadController = null;
  let settingsEditor = null;
  const snapshotSources = createSnapshotSourceRegistry();

  function clearSnapshotSources({ clearSnapshot = false } = {}) {
    snapshotSources.clear();
    state.content = null;
    state.downloads = [];
    if (clearSnapshot) state.snapshot = null;
  }

  function paletteStatus() {
    const availableSections = [
      state.content?.description?.available,
      state.content?.installation?.available,
      state.downloads.length > 0,
    ].filter(Boolean).length;
    state.ui.paletteStatus = availableSections
      ? availableSections === 3 ? "ready" : "partial"
      : "empty";
    state.ui.paletteMessage = availableSections
      ? availableSections === 3 ? "" : "Some opening-post sections were not found."
      : "No supported opening-post sections were found.";
  }

  function capturePaletteData(generation, { recapture = true } = {}) {
    let source = snapshotSources.get(
      state.snapshot?.sectionSources?.contentRootToken,
      generation,
    );
    if (recapture || !source) {
      state.snapshot = captureThreadSnapshot({
        document,
        pageContext: state.pageContext,
        generation,
        sourceRegistry: snapshotSources,
      });
      state.displayTags = buildDisplayTags(state.snapshot.tags, state.tagPrefs, {
        excludedTagMode: state.settings.excludedTagMode,
      });
      source = snapshotSources.get(
        state.snapshot.sectionSources?.contentRootToken,
        generation,
      );
    }
    state.content = parseContentSections(source, {
      baseUrl: state.snapshot.url,
    });
    state.downloads = parseDownloads(source, {
      baseUrl: state.snapshot.url,
      sourceRegistry: snapshotSources,
    });
    paletteStatus();
  }

  const registration = createThreadUtilityRegistration({
    core,
    runtime,
    isEnabled: () => state.enabled,
  });
  const bindings = createThreadUtilityBindings({
    addonId: runtime.addonId,
    isEnabled: () => state.enabled,
    onOpenPalette: () => {
      const generation = lifecycle.getGeneration();
      const isCurrent = () => (
        state.enabled
        && !terminal
        && lifecycle.getGeneration() === generation
      );
      if (!isCurrent() || !state.snapshot) {
        return Promise.resolve({ ok: false, reason: "unavailable" });
      }
      state.ui.paletteStatus = "loading";
      state.ui.paletteMessage = "Reading the opening post…";
      return ui.openPalette({ generation, isCurrent }).then(async (result) => {
        if (!result?.ok || !isCurrent()) return result;
        try {
          capturePaletteData(generation, { recapture: false });
        } catch {
          state.content = null;
          state.downloads = [];
          state.ui.paletteStatus = "failure";
          state.ui.paletteMessage = "Opening-post details could not be loaded.";
        }
        return isCurrent() ? ui.updatePalette(generation) : {
          ok: false,
          reason: "stale_generation",
        };
      });
    },
    onCopyDescription: () => ui.copyDescription(),
    onDownloadAction: (action, id) => {
      if (action === "open") return downloadController?.open(id);
      if (action === "copy") return downloadController?.copy(id);
      if (action === "delegate") return downloadController?.delegate(id);
      if (action === "copy-all") return downloadController?.copyAll();
      return { ok: false, reason: "unknown_action" };
    },
    onOpenSettings: () => settingsEditor.open(),
    onRefreshPalette: async () => {
      const generation = lifecycle.getGeneration();
      if (!state.ui.dialogOpen || state.ui.dialogGeneration !== generation) {
        return { ok: false, reason: "stale_generation" };
      }
      state.ui.paletteStatus = "loading";
      state.ui.paletteMessage = "Refreshing thread details…";
      await ui.updatePalette(generation);
      try {
        capturePaletteData(generation);
      } catch {
        state.ui.paletteStatus = "failure";
        state.ui.paletteMessage = "Thread details could not be refreshed.";
      }
      return ui.updatePalette(generation);
    },
    onRunUtility: (utilityId) => utilityController?.execute(utilityId),
    onToggleContent: (sectionId) => ui.toggleContentSection(sectionId),
    onToggleTags: () => ui.toggleTags(),
  });
  ui = createThreadUtilityUiController({
    core,
    state,
    bindings,
    isTerminal: () => terminal,
  });
  settingsEditor = createThreadUtilitySettingsEditor({
    core,
    getSettings: () => state.settings,
    onSaved: () => lifecycle.refresh({ reason: "settings-saved" }),
  });
  const commands = createThreadUtilityCommandController({
    core,
    getLifecycle: () => lifecycle,
    onDialogClosed: () => {
      ui.handleDialogClosed();
      clearSnapshotSources();
    },
    onSettingsDialogClosed: () => settingsEditor.handleClosed(),
    onBeforePageChange: () => {
      clearSnapshotSources({ clearSnapshot: true });
      void ui.closePalette("before-page-change");
      void settingsEditor.close("before-page-change");
    },
  });

  async function loadContextAndSettings({ generation, isCurrent }) {
    const [pageContext, loaded, tagPrefsResult] = await Promise.all([
      getPageContext(core),
      loadThreadUtilitySettings(core),
      getTagPrefs(core),
    ]);
    if (!isCurrent()) return false;
    state.pageContext = pageContext;
    state.settings = loaded.settings;
    const applies = Array.isArray(pageContext?.pageScopes)
      && pageContext.pageScopes.includes("thread");
    if (!applies) {
      clearSnapshotSources({ clearSnapshot: true });
      return false;
    }
    state.snapshot = captureThreadSnapshot({
      document,
      pageContext,
      generation,
      sourceRegistry: snapshotSources,
    });
    state.tagPrefs = normalizeCoreTagPrefs(tagPrefsResult);
    state.displayTags = buildDisplayTags(state.snapshot.tags, state.tagPrefs, {
      excludedTagMode: state.settings.excludedTagMode,
    });
    const utilityRegistry = createUtilityRegistry();
    utilityController = createUtilityController({
      core,
      registry: utilityRegistry,
      quickSearches: state.settings.quickSearches,
      getSettings: () => state.settings,
      getActionContext: () => {
        const currentGeneration = lifecycle.getGeneration();
        return {
          generation: currentGeneration,
          snapshot: state.snapshot,
          isCurrent: () => (
            state.enabled
            && !terminal
            && lifecycle.getGeneration() === currentGeneration
          ),
          getSource: (token) => snapshotSources.get(token, currentGeneration),
        };
      },
    });
    state.utilities = utilityController.list().map(({ id, family, label }) =>
      Object.freeze({ id, family, label }));
    downloadController = createDownloadController({
      core,
      getContext: () => {
        const currentGeneration = lifecycle.getGeneration();
        return {
          downloads: state.downloads,
          isCurrent: () => (
            state.enabled
            && !terminal
            && lifecycle.getGeneration() === currentGeneration
          ),
          getSource: (token) => snapshotSources.get(token, currentGeneration),
        };
      },
      refreshSources: async () => {
        const currentGeneration = lifecycle.getGeneration();
        if (!state.enabled || terminal) return false;
        capturePaletteData(currentGeneration);
        return state.enabled
          && !terminal
          && lifecycle.getGeneration() === currentGeneration;
      },
    });
    return isCurrent();
  }

  lifecycle = createThreadUtilityLifecycle({
    onEnable: async ({ generation, isCurrent }) => {
      if (!await loadContextAndSettings({ generation, isCurrent }) || !isCurrent()) {
        state.enabled = false;
        await ui.disable("out-of-scope");
        registration.publishStatus();
        return { ok: false, reason: "out_of_scope" };
      }
      try {
        const result = await ui.enable({ isCurrent });
        if (!result?.ok || !isCurrent()) {
          state.enabled = false;
          return { ok: false, reason: "enable_superseded" };
        }
      } catch (error) {
        state.enabled = false;
        throw error;
      }
      state.enabled = true;
      registration.publishStatus();
      return { ok: true };
    },
    onDisable: async ({ reason }) => {
      state.enabled = false;
      clearSnapshotSources({ clearSnapshot: true });
      await settingsEditor.close(reason);
      await ui.disable(reason);
      registration.publishStatus();
      return { ok: true };
    },
    onRefresh: async ({ generation, isCurrent }) => {
      clearSnapshotSources({ clearSnapshot: true });
      await settingsEditor.close("refresh");
      if (!await loadContextAndSettings({ generation, isCurrent }) || !isCurrent()) {
        state.enabled = false;
        await ui.disable("out-of-scope");
        return { ok: false, reason: "out_of_scope" };
      }
      if (state.enabled) {
        const result = await ui.enable({ isCurrent });
        if (!result?.ok || !isCurrent()) return { ok: false, reason: "refresh_superseded" };
      }
      return { ok: true };
    },
    onTeardown: async ({ reason }) => {
      terminal = true;
      state.enabled = false;
      clearSnapshotSources({ clearSnapshot: true });
      await settingsEditor.close(reason);
      await ui.disable(reason);
      commands.unbind();
      return { ok: true };
    },
    onTeardownAcknowledged: (reason) => notifyTeardownComplete(core, reason),
  });

  async function bootstrap() {
    commands.bind();
    registration.register();
    const access = await getAddonAccess(core);
    if (!access?.ok || access.value?.blocked || access.value?.enabled === false) {
      state.enabled = false;
      registration.publishStatus();
      return;
    }
    await lifecycle.enable();
  }

  return {
    bootstrap,
    getLifecycle: () => lifecycle,
    getSnapshot: () => state.snapshot,
    getSnapshotSource: (token) => snapshotSources.get(token, lifecycle.getGeneration()),
    getState: () => state,
  };
}
