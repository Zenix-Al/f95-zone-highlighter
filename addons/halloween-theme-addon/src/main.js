import { createEl } from "../../shared/createEl.js";
import { ADDON_COMMAND_EVENT, getRuntimeConfig } from "./constants.js";
import { createCoreBridge } from "./coreBridge.js";

const runtime = getRuntimeConfig();
const bridge = createCoreBridge(runtime.addonId);

const STYLE_ID = "f95ue-halloween-theme-style";

const BG_CSS = `
  .p-body {
    background-image: url('https://f95zone.to/assets/halloween/web-left.png'),
                      url('https://f95zone.to/assets/halloween/web-right.png');
    background-position: left top, right top;
    background-repeat: no-repeat;
  }
`;

let isEnabled = true;

function statusMessage() {
  return isEnabled
    ? "Halloween theme is active."
    : "Halloween theme disabled — refresh recommended.";
}

// ==================== THEME ====================
function applyTheme() {
  debugLog("Applying Halloween theme...");
  // Swap logo
  document.querySelectorAll("img").forEach((img) => {
    if (!(img instanceof HTMLImageElement)) return;

    const src = img.getAttribute("src") || "";
    const srcset = img.getAttribute("srcset") || "";

    if (src.includes("/assets/logo.png") && !img.dataset.origSrc) {
      img.dataset.origSrc = src;
      img.setAttribute("src", src.replace("/assets/logo.png", "/assets/halloween/logo.png"));
    }
    if (srcset.includes("/assets/logo.png") && !img.dataset.origSrcset) {
      img.dataset.origSrcset = srcset;
      img.setAttribute(
        "srcset",
        srcset.replaceAll("/assets/logo.png", "/assets/halloween/logo.png"),
      );
    }
  });

  // Add background style
  if (!document.getElementById(STYLE_ID)) {
    const style = createEl("style", null, null, STYLE_ID);
    style.textContent = BG_CSS;
    document.head.appendChild(style);
  }
}

function teardownTheme() {
  document.querySelectorAll("img").forEach((img) => {
    if (img.dataset.origSrc) {
      img.setAttribute("src", img.dataset.origSrc);
      delete img.dataset.origSrc;
    }
    if (img.dataset.origSrcset) {
      img.setAttribute("srcset", img.dataset.origSrcset);
      delete img.dataset.origSrcset;
    }
  });

  document.getElementById(STYLE_ID)?.remove();
}

// ==================== TOGGLE ====================
function toggle(enabled) {
  debugLog("Toggling Halloween theme:", enabled);
  isEnabled = Boolean(enabled);

  if (isEnabled) {
    applyTheme();
  } else {
    teardownTheme();
  }

  bridge.dispatchCoreCommand("update-status", {
    addonId: runtime.addonId,
    status: isEnabled ? "installed" : "disabled",
    statusMessage: statusMessage(),
  });
}

// ==================== COMMAND LISTENER ====================
function bindCommands() {
  window.addEventListener(ADDON_COMMAND_EVENT, (e) => {
    const d = e?.detail || {};
    if (d.addonId !== runtime.addonId) return;

    const cmd = String(d.command || "").trim();

    if (cmd === "enable") toggle(true);
    else if (cmd === "disable") toggle(false);
    else if (cmd === "teardown") {
      teardownTheme();
      bridge.teardownComplete(d.reason || "teardown");
    }
  });
}

// ==================== BOOTSTRAP ====================
async function bootstrap() {
  const ping = await bridge.waitForCorePing();
  if (!ping.ok && runtime.runtimeMode === "core-required") return;

  bindCommands();

  // Always register so it stays visible in the panel even when disabled
  bridge.dispatchCoreCommand("register", {
    addon: {
      id: runtime.addonId,
      name: runtime.addonName,
      version: runtime.addonVersion,
      description: runtime.addonDescription,
      status: isEnabled ? "installed" : "disabled",
      statusMessage: statusMessage(),
      panelTitle: runtime.addonName,
      panelBody: "Toggle to apply/remove Halloween theme (refresh recommended)",
      capabilities: runtime.capabilities,
      pageScopes: runtime.pageScopes,
      runtimeMode: runtime.runtimeMode,
      matches: runtime.matches,
    },
  });

  const access = await bridge.invokeCoreAction("addon.access", {});
  if (!access?.ok || access.value?.blocked) {
    toggle(false);
    return;
  }

  if (isEnabled) applyTheme();
}

void bootstrap();
