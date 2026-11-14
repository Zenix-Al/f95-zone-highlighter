import { getQuickResolveUrl, resolveQuickDownload } from "../../domain/quickResolve.js";

// Initial scan plus delegated discovery for lazy content; no polling or extra observer.
export function createQuickResolveController({
  getAutomationSettings,
  isAllowed = () => true,
  resolve = resolveQuickDownload,
  openTab,
  documentRef = document,
  windowRef = window,
}) {
  const buttons = new Map();
  let active = false,
    watching = false,
    generation = 0,
    operation = null;
  function attach(link) {
    if (
      !active ||
      !link?.isConnected ||
      link.closest("[hidden], .u-hidden") ||
      buttons.has(link) ||
      !getQuickResolveUrl(link.href)
    )
      return;
    const button = documentRef.createElement("button");
    button.type = "button";
    button.textContent = "Resolve";
    button.title = "Resolve with one GET and POST, without opening the F95 download page";
    button.className = "button button--small f95ue-quick-resolve";
    Object.assign(button.style, {
      backgroundColor: "#a94442",
      color: "#fff",
      marginInlineStart: "6px",
    });
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (operation || !active || !link.isConnected) return;
      const controller = new AbortController();
      operation = controller;
      button.disabled = true;
      button.textContent = "Resolving…";
      let failed = false;
      try {
        const settings = await getAutomationSettings();
        if (
          !active ||
          !isAllowed() ||
          settings.enabled !== true ||
          settings.needsSettingsRefresh ||
          settings.quickResolveEnabled !== true
        )
          return;
        const source = link.href;
        if (!getQuickResolveUrl(source))
          throw new Error("Download link changed. Use the original link.");
        const destination = await resolve(source, { signal: controller.signal });
        controller.signal.throwIfAborted();
        const latest = await getAutomationSettings();
        controller.signal.throwIfAborted();
        if (
          active &&
          isAllowed() &&
          latest.enabled === true &&
          !latest.needsSettingsRefresh &&
          latest.quickResolveEnabled === true &&
          link.isConnected &&
          link.href === source
        ) {
          if (typeof openTab !== "function")
            throw new Error("New-tab permission unavailable. Use the original link.");
          const tab = await openTab(destination);
          if (!tab)
            throw new Error(
              "The userscript manager did not open the destination. Use the original link.",
            );
          controller.signal.throwIfAborted();
          if (!active || !button.isConnected || !link.isConnected || link.href !== source) return;
          const resolved = documentRef.createElement("a");
          resolved.href = destination;
          resolved.target = "_blank";
          resolved.rel = "noopener";
          resolved.textContent = "Resolved";
          resolved.title = "Open the resolved download link";
          resolved.className = `${button.className} is-resolved`;
          resolved.style.cssText = button.style.cssText;
          resolved.style.backgroundColor = "#388e3c";
          button.replaceWith(resolved);
          buttons.set(link, resolved);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          failed = true;
          button.textContent = "Use normal link";
          button.title = error.message || "Resolution failed. Use the original link.";
        }
      } finally {
        if (operation === controller) operation = null;
        button.disabled = failed;
        if (button.textContent === "Resolving…") button.textContent = "Resolve";
      }
    });
    link.insertAdjacentElement("afterend", button);
    buttons.set(link, button);
  }
  function discover(event) {
    attach(event.target?.closest?.("a[href]"));
  }
  function suspend() {
    generation += 1;
    active = false;
    operation?.abort();
    operation = null;
    documentRef.removeEventListener("pointerover", discover);
    documentRef.removeEventListener("focusin", discover);
    for (const button of buttons.values()) button.remove();
    buttons.clear();
  }
  async function start() {
    const current = ++generation;
    const settings = await getAutomationSettings();
    if (current !== generation) return;
    suspend();
    if (
      !isAllowed() ||
      settings.enabled !== true ||
      settings.needsSettingsRefresh ||
      settings.quickResolveEnabled !== true
    )
      return stop();
    active = true;
    if (!watching) {
      watching = true;
      windowRef.addEventListener("pagehide", suspend);
      windowRef.addEventListener("pageshow", resume);
    }
    documentRef.addEventListener("pointerover", discover);
    documentRef.addEventListener("focusin", discover);
    for (const link of documentRef.querySelectorAll('a[href*="/dl/"]')) attach(link);
  }
  function resume() {
    void start().catch(stop);
  }
  function stop() {
    suspend();
    watching = false;
    windowRef.removeEventListener("pagehide", suspend);
    windowRef.removeEventListener("pageshow", resume);
  }
  return { start, stop };
}
