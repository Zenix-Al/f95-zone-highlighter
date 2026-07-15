export function createExampleUiBindings({ onAction, onDockAction, isEnabled, addonId }) {
  let panelClickHandler = null;
  let dockClickHandler = null;

  function bindPanelClicks() {
    if (panelClickHandler) return;
    panelClickHandler = (event) => {
      const button = event.target?.closest?.("button[data-example-action]");
      if (!button) return;
      const action = String(button.dataset.exampleAction || "").trim();
      if (!action) return;
      event.preventDefault();
      void onAction(action);
    };
    document.addEventListener("click", panelClickHandler, true);
  }

  function unbindPanelClicks() {
    if (!panelClickHandler) return;
    document.removeEventListener("click", panelClickHandler, true);
    panelClickHandler = null;
  }

  function resolveDockActionButton(event) {
    const path = typeof event?.composedPath === "function" ? event.composedPath() : [];
    let inExampleDock = false;
    let actionEl = null;
    for (const node of path) {
      if (!node || node.nodeType !== 1) continue;
      if (!inExampleDock && String(node.getAttribute?.("data-role") || "").trim() === "exampleDock") {
        inExampleDock = true;
      }
      if (!actionEl && typeof node.matches === "function" && node.matches("button[data-action]")) {
        actionEl = node;
      }
      if (inExampleDock && actionEl) break;
    }
    return inExampleDock && actionEl ? actionEl : null;
  }

  function bindDockMountEvents() {
    if (dockClickHandler) return;
    dockClickHandler = (event) => {
      if (!isEnabled()) return;
      const actionEl = resolveDockActionButton(event);
      if (!actionEl) return;
      const action = String(actionEl.dataset.action || "").trim();
      if (!action) return;
      event.preventDefault();
      if (action === "open-example") void onDockAction("open-panel");
    };
    window.addEventListener("click", dockClickHandler, true);
  }

  function unbindDockMountEvents() {
    if (!dockClickHandler) return;
    window.removeEventListener("click", dockClickHandler, true);
    dockClickHandler = null;
  }

  return {
    bindPanelClicks,
    unbindPanelClicks,
    bindDockMountEvents,
    unbindDockMountEvents,
    owner: addonId,
  };
}
