import { stateManager } from "../../config.js";
import {
  persistSettingsUiValue,
  SETTINGS_ACTIVE_PANEL_STORAGE_KEY,
  getDefaultSettingsPanelId,
} from "../settingsRuntime/prefs.js";

const DEFAULT_SETTINGS_PANEL = getDefaultSettingsPanelId();

function isMobileSettingsViewport() {
  try {
    return Boolean(window.matchMedia && window.matchMedia("(max-width: 760px)").matches);
  } catch {
    return false;
  }
}

function setMobileShellView(shadowRoot, showPanel) {
  const shell = shadowRoot?.querySelector?.(".settings-shell");
  const mobileHeader = shadowRoot?.getElementById?.("settings-mobile-panel-header");
  if (!shell) return;

  if (!isMobileSettingsViewport()) {
    shell.classList.remove("mobile-show-panel");
    if (mobileHeader) mobileHeader.hidden = true;
    return;
  }

  shell.classList.toggle("mobile-show-panel", Boolean(showPanel));
  if (mobileHeader) mobileHeader.hidden = !Boolean(showPanel);
}

export function setActivePanel(
  shadowRoot,
  targetId,
  { persist = true, resetScroll = true, showMobilePanel = true } = {},
) {
  const navItems = [...shadowRoot.querySelectorAll(".settings-nav-item[data-target]")];
  const panels = [...shadowRoot.querySelectorAll(".settings-panel")];
  if (navItems.length === 0 || panels.length === 0) return;

  const panelIds = new Set(panels.map((panel) => panel.id));
  const nextPanelId = panelIds.has(targetId) ? targetId : DEFAULT_SETTINGS_PANEL;

  navItems.forEach((item) => {
    const isActive = item.dataset.target === nextPanelId;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-current", isActive ? "page" : "false");
  });

  panels.forEach((panel) => {
    const isActive = panel.id === nextPanelId;
    panel.classList.toggle("active", isActive);
    if (isActive && resetScroll) panel.scrollTop = 0;
  });

  stateManager.set("settingsActivePanel", nextPanelId);
  if (persist) {
    void persistSettingsUiValue(SETTINGS_ACTIVE_PANEL_STORAGE_KEY, nextPanelId);
  }

  const activeNav = navItems.find((item) => item.dataset.target === nextPanelId);
  const mobileTitle = shadowRoot.getElementById("settings-mobile-title");
  if (mobileTitle) {
    mobileTitle.textContent = String(activeNav?.textContent || "Settings").trim() || "Settings";
  }
  setMobileShellView(shadowRoot, showMobilePanel);
}

export function syncActiveSettingsPanel(shadowRoot, rerenderPanels) {
  const activePanelId = String(stateManager.get("settingsActivePanel") || DEFAULT_SETTINGS_PANEL);
  const activePanelBeforeSync = shadowRoot.getElementById(activePanelId);
  const preservedScrollTop = Number(activePanelBeforeSync?.scrollTop || 0);
  const shell = shadowRoot.querySelector(".settings-shell");
  const keepMobilePanelOpen = Boolean(shell?.classList?.contains("mobile-show-panel"));

  if (typeof rerenderPanels === "function") {
    rerenderPanels();
  }

  setActivePanel(shadowRoot, activePanelId, {
    persist: false,
    resetScroll: false,
    showMobilePanel: keepMobilePanelOpen,
  });

  const activePanelAfterSync = shadowRoot.getElementById(activePanelId);
  if (activePanelAfterSync) {
    activePanelAfterSync.scrollTop = preservedScrollTop;
  }
}

export function initSettingsPanelNavigation(shadowRoot) {
  const nav = shadowRoot.getElementById("settings-nav");
  if (!nav || nav.dataset.initBound) return;

  const mobileBackBtn = shadowRoot.getElementById("settings-mobile-back");
  const mobileCloseBtn = shadowRoot.getElementById("settings-mobile-close");

  setMobileShellView(shadowRoot, false);

  nav.addEventListener("click", (event) => {
    const target = event.target?.closest?.(".settings-nav-item[data-target]");
    if (!target) return;
    const targetPanelId = String(target.dataset.target || "").trim();
    setActivePanel(shadowRoot, targetPanelId);
  });

  mobileBackBtn?.addEventListener("click", () => {
    setMobileShellView(shadowRoot, false);
  });

  mobileCloseBtn?.addEventListener("click", () => {
    shadowRoot.getElementById("close-modal")?.click();
  });

  window.addEventListener("resize", () => {
    if (!isMobileSettingsViewport()) {
      setMobileShellView(shadowRoot, false);
    }
  });

  nav.dataset.initBound = "1";
}
