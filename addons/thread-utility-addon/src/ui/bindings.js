export function createThreadUtilityBindings({
  addonId,
  isEnabled,
  onOpenPalette,
  onRunUtility,
  onCopyDescription,
  onDownloadAction,
  onOpenSettings,
  onRefreshPalette,
  onToggleContent,
  onToggleTags,
}) {
  let clickHandler = null;
  let dialogClickHandler = null;

  function resolveLauncherButton(event) {
    const path = typeof event?.composedPath === "function" ? event.composedPath() : [];
    let ownedRoot = false;
    let actionButton = null;
    for (const node of path) {
      if (!node || node.nodeType !== 1) continue;
      if (
        String(node.getAttribute?.("data-role") || "").trim()
        === "threadUtilityLauncher"
      ) {
        ownedRoot = true;
      }
      if (
        !actionButton
        && node.matches?.('button[data-thread-utility-action="open-palette"]')
      ) {
        actionButton = node;
      }
      if (ownedRoot && actionButton) break;
    }
    return ownedRoot ? actionButton : null;
  }

  function bindLauncherEvents() {
    if (clickHandler) return;
    clickHandler = (event) => {
      if (!isEnabled()) return;
      const downloadButton = event.target?.closest?.(
        "button[data-download-action]",
      );
      if (downloadButton?.closest?.('[data-role="threadUtilityPalette"]')) {
        event.preventDefault();
        void onDownloadAction(
          String(downloadButton.dataset.downloadAction || ""),
          String(downloadButton.dataset.downloadId || ""),
        );
        return;
      }
      const button = resolveLauncherButton(event);
      if (!button) return;
      event.preventDefault();
      void onOpenPalette();
    };
    window.addEventListener("click", clickHandler, true);
  }

  function unbindLauncherEvents() {
    if (!clickHandler) return;
    window.removeEventListener("click", clickHandler, true);
    clickHandler = null;
  }

  function bindDialogEvents() {
    if (dialogClickHandler) return;
    dialogClickHandler = (event) => {
      if (!isEnabled()) return;
      const footerButton = event.target?.closest?.(
        "button[data-thread-utility-footer-action]",
      );
      if (footerButton?.closest?.('[data-role="threadUtilityPalette"]')) {
        event.preventDefault();
        const action = String(footerButton.dataset.threadUtilityFooterAction || "");
        if (action === "refresh") void onRefreshPalette();
        if (action === "settings") void onOpenSettings();
        return;
      }
      const contentButton = event.target?.closest?.(
        'button[data-thread-utility-action="toggle-content"][data-section-id]',
      );
      if (contentButton?.closest?.('[data-role="threadUtilityPalette"]')) {
        const sectionId = String(contentButton.dataset.sectionId || "").trim();
        if (!sectionId) return;
        event.preventDefault();
        void onToggleContent(sectionId);
        return;
      }
      const copyDescriptionButton = event.target?.closest?.(
        'button[data-thread-utility-action="copy-description"]',
      );
      if (copyDescriptionButton?.closest?.('[data-role="threadUtilityPalette"]')) {
        event.preventDefault();
        void onCopyDescription();
        return;
      }
      const utilityButton = event.target?.closest?.(
        'button[data-thread-utility-action="run-utility"][data-utility-id]',
      );
      if (utilityButton?.closest?.('[data-role="threadUtilityPalette"]')) {
        const utilityId = String(utilityButton.dataset.utilityId || "").trim();
        if (!utilityId) return;
        event.preventDefault();
        void onRunUtility(utilityId);
        return;
      }
      const button = event.target?.closest?.(
        'button[data-thread-utility-action="toggle-tags"]',
      );
      if (!button?.closest?.('[data-role="threadUtilityPalette"]')) return;
      event.preventDefault();
      void onToggleTags();
    };
    document.addEventListener("click", dialogClickHandler, true);
  }

  function unbindDialogEvents() {
    if (!dialogClickHandler) return;
    document.removeEventListener("click", dialogClickHandler, true);
    dialogClickHandler = null;
  }

  function rebindDialogEvents() {
    unbindDialogEvents();
    bindDialogEvents();
  }

  return {
    bindDialogEvents,
    bindLauncherEvents,
    owner: addonId,
    rebindDialogEvents,
    unbindDialogEvents,
    unbindLauncherEvents,
  };
}
