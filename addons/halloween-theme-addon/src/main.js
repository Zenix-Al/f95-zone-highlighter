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
let addonCommandHandlerBound = false;

function statusMessage() {
  return isEnabled ? "Halloween theme is active." : "Halloween theme add-on is disabled.";
}

function registerAddon() {
  bridge.dispatchCoreCommand("register", {
    addon: {
      id: runtime.addonId,
      name: runtime.addonName,
      version: runtime.addonVersion,
      description: runtime.addonDescription,
      status: isEnabled ? "installed" : "disabled",
      statusMessage: statusMessage(),
      panelTitle: runtime.addonName,
      panelBody: "Toggle this add-on to apply or remove the Halloween look.",
      capabilities: runtime.capabilities,
      pageScopes: ["thread", "latest", "download", "global"],
    },
  });
}

function pushStatusUpdate() {
  bridge.dispatchCoreCommand("update-status", {
    addonId: runtime.addonId,
    status: isEnabled ? "installed" : "disabled",
    statusMessage: statusMessage(),
  });
  registerAddon();
}

function swapLogoToHalloween(image) {
  if (!(image instanceof HTMLImageElement)) return;

  if (image.hasAttribute("src")) {
    const src = String(image.getAttribute("src") || "");
    if (src.includes("/assets/logo.png") && !image.dataset.f95ueThemeOrigSrc) {
      image.dataset.f95ueThemeOrigSrc = src;
      image.setAttribute("src", src.replace("/assets/logo.png", "/assets/halloween/logo.png"));
    }
  }

  if (image.hasAttribute("srcset")) {
    const srcset = String(image.getAttribute("srcset") || "");
    if (srcset.includes("/assets/logo.png") && !image.dataset.f95ueThemeOrigSrcset) {
      image.dataset.f95ueThemeOrigSrcset = srcset;
      image.setAttribute(
        "srcset",
        srcset.replaceAll("/assets/logo.png", "/assets/halloween/logo.png"),
      );
    }
  }
}

function restoreLogo(image) {
  if (!(image instanceof HTMLImageElement)) return;

  if (image.dataset.f95ueThemeOrigSrc) {
    image.setAttribute("src", image.dataset.f95ueThemeOrigSrc);
    delete image.dataset.f95ueThemeOrigSrc;
  }

  if (image.dataset.f95ueThemeOrigSrcset) {
    image.setAttribute("srcset", image.dataset.f95ueThemeOrigSrcset);
    delete image.dataset.f95ueThemeOrigSrcset;
  }
}

function applyTheme() {
  document.querySelectorAll("img").forEach(swapLogoToHalloween);

  if (!document.getElementById(STYLE_ID)) {
    const styleEl = document.createElement("style");
    styleEl.id = STYLE_ID;
    styleEl.textContent = BG_CSS;
    document.head.appendChild(styleEl);
  }
}

function teardownTheme() {
  document.querySelectorAll("img").forEach(restoreLogo);
  document.getElementById(STYLE_ID)?.remove();
}

function setEnabled(nextEnabled) {
  isEnabled = Boolean(nextEnabled);
  if (isEnabled) applyTheme();
  else teardownTheme();
  pushStatusUpdate();
}

function bindAddonCommandListener() {
  if (addonCommandHandlerBound) return;

  window.addEventListener(ADDON_COMMAND_EVENT, (event) => {
    const detail = event?.detail || {};
    if (String(detail.addonId || "") !== runtime.addonId) return;

    const command = String(detail.command || "").trim();
    if (command === "enable") {
      setEnabled(true);
      return;
    }
    if (command === "disable") {
      setEnabled(false);
      return;
    }
    if (command === "teardown") {
      teardownTheme();
      bridge.teardownComplete(String(detail.reason || "teardown"));
    }
  });

  addonCommandHandlerBound = true;
}

async function bootstrap() {
  const ping = await bridge.waitForCorePing();
  if (!ping.ok && runtime.requiresCore) {
    return;
  }

  bindAddonCommandListener();
  registerAddon();
  if (isEnabled) {
    applyTheme();
  }
  pushStatusUpdate();
}

void bootstrap();
