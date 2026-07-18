import { debugLog } from "../../../shared/debugLog.js";
import { getPageContext } from "../api/page.js";
import { waitForElement } from "../api/observer.js";
import { mountUi, unmountUi } from "../api/ui/mount.js";
import { getThreadSnapshot } from "../thread/detector.js";
import { renderDockMarkup } from "../ui/components/dock/dockRenderer.js";
import { showToast } from "../ui/utils/showToast.js";

const LIBRARY_DOCK_MOUNT_ID = "library-dock-widget";

export function createLibraryDockController({
  core,
  runtime,
  library,
  state,
  getLifecycle,
  getLocalPageContext,
}) {
  let currentSnapshot = null;
  let currentSaved = false;
  let clickHandler = null;
  let mountToken = 0;

  function isCurrent(context) {
    return (
      !context ||
      typeof context.isCurrent !== "function" ||
      context.isCurrent()
    );
  }

  function resolveActionButton(event) {
    const path =
      typeof event?.composedPath === "function" ? event.composedPath() : [];
    let inLibraryDock = false;
    let actionElement = null;
    for (const node of path) {
      if (!node || node.nodeType !== 1) continue;
      if (
        !inLibraryDock &&
        String(node.getAttribute?.("data-role") || "").trim() === "libraryDock"
      ) {
        inLibraryDock = true;
      }
      if (
        !actionElement &&
        typeof node.matches === "function" &&
        node.matches("button[data-action]")
      ) {
        actionElement = node;
      }
      if (inLibraryDock && actionElement) break;
    }
    return inLibraryDock ? actionElement : null;
  }

  function unbindEvents() {
    if (clickHandler) getLifecycle().releaseResource("library-dock-listener");
  }

  function bindEvents() {
    if (clickHandler) return;
    clickHandler = (event) => {
      if (!state.enabled) return;
      const actionElement = resolveActionButton(event);
      if (!actionElement) return;
      const action = String(actionElement.dataset.action || "").trim();
      if (action === "open-library") state.openManager();
      else if (action === "toggle-thread") void toggleCurrentThread();
      else if (action === "update-thread") void updateCurrentThread();
    };
    window.addEventListener("click", clickHandler, true);
    getLifecycle().registerResource(
      "library-dock-listener",
      () => {
        if (clickHandler) {
          window.removeEventListener("click", clickHandler, true);
        }
        clickHandler = null;
      },
      "listener",
    );
    debugLog(runtime.addonId, "Dock click listener bound.");
  }

  async function mount({ showPrimaryButton, isSaved, context = null }) {
    if (!state.enabled || !isCurrent(context)) {
      return { ok: false, reason: "stale_mount" };
    }
    const token = ++mountToken;
    debugLog(runtime.addonId, "Dock mount requested.", {
      data: { showPrimaryButton, isSaved },
    });
    const result = await mountUi(core, {
      mountId: LIBRARY_DOCK_MOUNT_ID,
      slot: "page.dock",
      html: renderDockMarkup({ showPrimaryButton, isSaved }),
    });
    debugLog(runtime.addonId, "Dock mount settled.", { data: result });
    if (!state.enabled || !isCurrent(context) || token !== mountToken) {
      if (token === mountToken) {
        await unmountUi(core, LIBRARY_DOCK_MOUNT_ID);
      }
      return { ok: false, reason: "stale_mount" };
    }
    if (!result?.ok) return result;
    bindEvents();
    return result;
  }

  async function refresh(context = null) {
    if (!isCurrent(context)) return { ok: false, reason: "stale_mount" };
    debugLog(runtime.addonId, "Dock applicability refresh.", {
      data: {
        isEnabled: state.enabled,
        showPageButtons: state.showPageButtons,
      },
    });
    if (!state.enabled || !state.showPageButtons) return unmount();

    const pageContext = await getPageContext(core, getLocalPageContext);
    if (!state.enabled || !isCurrent(context)) {
      return { ok: false, reason: "stale_mount" };
    }
    const threadPage = pageContext?.pageScopes?.includes("thread") || false;
    if (threadPage) {
      await waitForElement(
        core,
        "library-thread-title",
        "h1.p-title-value",
        2500,
        () => ({ ok: false, reason: "unsupported_action" }),
      );
      if (!state.enabled || !isCurrent(context)) {
        return { ok: false, reason: "stale_mount" };
      }
    }

    const snapshot = threadPage ? getThreadSnapshot() : null;
    debugLog(runtime.addonId, "Thread snapshot resolved.", { data: snapshot });
    if (!snapshot?.threadId) {
      currentSnapshot = null;
      currentSaved = false;
      debugLog(
        runtime.addonId,
        "Mounting site-wide manager dock without thread controls.",
      );
      return mount({ showPrimaryButton: false, isSaved: false, context });
    }

    const saved = await library.isSaved(snapshot.threadId);
    if (!state.enabled || !isCurrent(context)) {
      return { ok: false, reason: "stale_mount" };
    }
    currentSnapshot = snapshot;
    currentSaved = Boolean(saved);
    return mount({ showPrimaryButton: true, isSaved: currentSaved, context });
  }

  async function unmount() {
    mountToken += 1;
    currentSnapshot = null;
    currentSaved = false;
    unbindEvents();
    await unmountUi(core, LIBRARY_DOCK_MOUNT_ID);
  }

  async function toggleCurrentThread() {
    const snapshot = currentSnapshot || getThreadSnapshot();
    if (!snapshot?.threadId) {
      showToast("Open a thread page to save it into the library.", "error");
      return;
    }
    const saved = await library.isSaved(snapshot.threadId);
    const result = saved
      ? await library.removeEntry(snapshot.threadId)
      : await library.saveEntry(snapshot);
    showToast(
      result?.ok
        ? saved
          ? "Removed from library."
          : "Saved to library."
        : saved
          ? "Failed to remove entry."
          : "Failed to save entry.",
      result?.ok ? "success" : "error",
    );
    await refresh();
  }

  async function updateCurrentThread() {
    const snapshot = currentSnapshot || getThreadSnapshot();
    if (!snapshot?.threadId) {
      showToast("Open a thread page to update it from the library.", "error");
      return;
    }
    if (!(await library.isSaved(snapshot.threadId))) {
      showToast("Save this thread first before updating.", "error");
      return;
    }
    const result = await library.patchEntry(snapshot.threadId, {
      url: String(snapshot.url || "").trim(),
      title: String(snapshot.title || "").trim(),
      canonicalTitle: String(
        snapshot.canonicalTitle || snapshot.title || "",
      ).trim(),
      titleNormalized: String(
        snapshot.titleNormalized || snapshot.title || "",
      )
        .trim()
        .toLowerCase(),
      prefix: String(snapshot.prefix || "").trim(),
      gameVersion: String(snapshot.gameVersion || "").trim(),
      prefixes: Array.isArray(snapshot.prefixes) ? snapshot.prefixes : [],
      developer: String(snapshot.developer || "").trim(),
      threadRating: Number.isFinite(Number(snapshot.threadRating))
        ? Number(snapshot.threadRating)
        : null,
      tags: Array.isArray(snapshot.tags) ? snapshot.tags : [],
      sourcePage: "thread",
    });
    showToast(
      result?.ok
        ? "Updated from this thread."
        : `Failed to update: ${result?.reason || "unknown"}`,
      result?.ok ? "success" : "error",
    );
    await refresh();
  }

  async function saveCurrentThread() {
    if (!state.enabled) {
      showToast("Library add-on is disabled.", "error");
      return;
    }
    const snapshot = getThreadSnapshot();
    if (!snapshot?.threadId) {
      showToast("Open a thread page to save it into the library.", "error");
      return;
    }
    const result = await library.saveEntry(snapshot);
    showToast(
      result?.ok
        ? "Current thread saved to library."
        : "Failed to save current thread.",
      result?.ok ? "success" : "error",
    );
    if (result?.ok) await state.refreshRuntime();
  }

  return { refresh, saveCurrentThread, unmount };
}
