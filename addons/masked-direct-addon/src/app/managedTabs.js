export function createManagedDownloadTabs() {
  const tabs = new Map();

  function register(requestId, tab) {
    const id = String(requestId || "").trim();
    if (!id || !tab || typeof tab.close !== "function") return;
    tabs.set(id, tab);
    try {
      const previousOnClose = tab.onclose;
      tab.onclose = (...args) => {
        tabs.delete(id);
        if (typeof previousOnClose === "function") {
          previousOnClose.apply(tab, args);
        }
      };
    } catch {
      // Some userscript managers expose a read-only tab handle.
    }
  }

  function close(requestId) {
    const id = String(requestId || "").trim();
    if (!id) return false;
    const tab = tabs.get(id);
    if (!tab || typeof tab.close !== "function") return false;
    try {
      tab.close();
      tabs.delete(id);
      console.info("[DirectDownload] Closed managed tab:", id);
      return true;
    } catch (error) {
      console.warn("[DirectDownload] Failed to close managed tab:", error);
      return false;
    }
  }

  return { register, close };
}
