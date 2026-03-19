import stateManager, { config } from "../../config.js";
import { imageRepairFeature } from "../../features/image-repair/index.js";
import { checkOverlaySettings } from "../../services/safetyService";
import { signatureCollapseFeature } from "../../features/signature-collapse/index.js";
import { directDownloadFeature } from "../../features/direct-download/index.js";
import { toggleHijackMaskedLink } from "../../features/masked-link-skipper/index.js";
import { debouncedProcessThreadTags } from "../../core/tasksRegistry";
import { wideForumFeature } from "../../features/wideForum/index.js";
import { openSettingsDialog } from "../components/dialog.js";
import { buildSettingsMap, createEnabledDisabledToast, createToggleSetting } from "./metaFactory";
import {
  dismissDirectDownloadHostNotices,
  getAutoDisabledDirectDownloadPackageKeys,
  getDirectDownloadHostLabel,
  resetDirectDownloadHostBreaker,
} from "../../features/direct-download/hostBreaker.js";

const effectOverlayToggle = () => {
  checkOverlaySettings();
  if (!stateManager.get("isThread")) return;
  debouncedProcessThreadTags();
};

const threadOverlayToggleSetting = createToggleSetting({
  text: "Enable overlay",
  tooltip: "Show thread status overlay on thread pages",
  config: "threadSettings.threadOverlayToggle",
  custom: effectOverlayToggle,
  toast: createEnabledDisabledToast("Thread overlay"),
});

const DIRECT_DOWNLOAD_NOTICE_CLASS = "direct-download-health-notice";

function formatAutoDisabledHostLabels(packageKeys) {
  return packageKeys.map((key) => getDirectDownloadHostLabel(key));
}

function buildDirectDownloadNoticeText(packageKeys) {
  const labels = formatAutoDisabledHostLabels(packageKeys);
  if (labels.length === 0) return "";
  return `Direct download auto-disabled for: ${labels.join(", ")}. You can re-enable, but automation may still fail.`;
}

function removeDirectDownloadNotice(container) {
  if (!container) return;
  container.querySelectorAll(`.${DIRECT_DOWNLOAD_NOTICE_CLASS}`).forEach((node) => node.remove());
}

function insertNoticeBeforeSetting(container, notice, settingKeys = []) {
  for (const key of settingKeys) {
    const target = container.querySelector(`[data-setting-key="${key}"]`);
    if (target && target.parentNode === container) {
      container.insertBefore(notice, target);
      return;
    }
  }
  container.prepend(notice);
}

function createDirectDownloadNoticeElement({
  packageKeys,
  onOpenSettings,
  onDismiss,
  showOpenSettings = true,
}) {
  const notice = document.createElement("div");
  notice.className = DIRECT_DOWNLOAD_NOTICE_CLASS;
  const text = document.createElement("div");
  text.className = "direct-download-health-notice-text";
  text.textContent = buildDirectDownloadNoticeText(packageKeys);
  notice.appendChild(text);

  const actions = document.createElement("div");
  actions.className = "direct-download-health-notice-actions";

  if (showOpenSettings && typeof onOpenSettings === "function") {
    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "modal-btn direct-download-health-notice-btn";
    openBtn.textContent = "Open settings";
    openBtn.addEventListener("click", () => onOpenSettings());
    actions.appendChild(openBtn);
  }

  const dismissBtn = document.createElement("button");
  dismissBtn.type = "button";
  dismissBtn.className = "modal-btn direct-download-health-notice-btn";
  dismissBtn.textContent = "Dismiss";
  dismissBtn.addEventListener("click", async () => {
    await dismissDirectDownloadHostNotices(packageKeys);
    if (typeof onDismiss === "function") {
      onDismiss();
    }
  });
  actions.appendChild(dismissBtn);
  notice.appendChild(actions);

  return notice;
}

function renderDirectDownloadNoticeInContainer(
  container,
  { settingKeys = [], showOpenSettings = true, onDismiss = null } = {},
) {
  if (!container) return;
  removeDirectDownloadNotice(container);
  const packageKeys = getAutoDisabledDirectDownloadPackageKeys({ undismissedOnly: true });
  if (packageKeys.length === 0) return;
  const notice = createDirectDownloadNoticeElement({
    packageKeys,
    onOpenSettings: showOpenSettings ? openDirectDownloadSettingsDialog : null,
    onDismiss: () => {
      renderDirectDownloadHealthNotices();
      if (typeof onDismiss === "function") onDismiss();
    },
    showOpenSettings,
  });
  insertNoticeBeforeSetting(container, notice, settingKeys);
}

function renderDirectDownloadHealthNoticeInDialogIfOpen() {
  const shadowRoot = stateManager.get("shadowRoot");
  if (!shadowRoot) return;
  const dialogContent = shadowRoot.querySelector("#latest-config-dialog .config-dialog-settings");
  if (!dialogContent) return;
  const hasDirectDownloadSettings = dialogContent.querySelector(
    '[data-setting-key="dialog-directDownloadLinks"]',
  );
  if (!hasDirectDownloadSettings) return;
  renderDirectDownloadNoticeInContainer(dialogContent, {
    settingKeys: ["dialog-directDownloadLinks"],
    showOpenSettings: false,
  });
}

export function renderDirectDownloadHealthNotices() {
  const shadowRoot = stateManager.get("shadowRoot");
  if (!shadowRoot) return;
  const container = shadowRoot.getElementById("thread-settings-container");
  if (!container) return;
  renderDirectDownloadNoticeInContainer(container, {
    settingKeys: ["directDownloadSettings"],
    showOpenSettings: true,
  });
}

function syncDirectDownloadFeatureIfEnabled() {
  if (config.threadSettings.directDownloadLinks) {
    directDownloadFeature.toggle(directDownloadFeature.isEnabled());
  }
}

async function handleDirectDownloadPackageToggle(packageKey, enabled) {
  if (enabled) {
    await resetDirectDownloadHostBreaker(packageKey);
  }
  syncDirectDownloadFeatureIfEnabled();
  renderDirectDownloadHealthNotices();
  renderDirectDownloadHealthNoticeInDialogIfOpen();
}

function createDirectDownloadPackageSetting({ packageKey, text, tooltip, toastLabel }) {
  return createToggleSetting({
    text,
    tooltip,
    config: `threadSettings.directDownloadPackages.${packageKey}`,
    custom: (enabled) => {
      void handleDirectDownloadPackageToggle(packageKey, enabled);
    },
    toast: createEnabledDisabledToast(toastLabel),
  });
}

function openThreadOverlaySettingsDialog() {
  openSettingsDialog({
    title: "Thread Overlay Settings",
    description: "Configure thread overlay visibility and styles.",
    metaMap: threadOverlaySettingsMeta,
  });
}

function openDirectDownloadSettingsDialog() {
  const dialog = openSettingsDialog({
    title: "Direct Download Settings",
    description:
      "Configure direct download toggle and supported host packages. Some toggles control grouped domains needed for one flow.",
    metaMap: directDownloadSettingsMeta,
  });
  if (!dialog?.content) return;
  renderDirectDownloadNoticeInContainer(dialog.content, {
    settingKeys: ["dialog-directDownloadLinks"],
    showOpenSettings: false,
    onDismiss: () =>
      renderDirectDownloadNoticeInContainer(dialog.content, {
        settingKeys: ["dialog-directDownloadLinks"],
        showOpenSettings: false,
      }),
  });
}

const THREAD_SETTINGS_TOGGLE_DEFS = [
  {
    key: "isWide",
    text: "Wide thread (full width)",
    tooltip: "Remove max-width restriction - makes thread use full screen width",
    config: "threadSettings.isWide",
    custom: () => wideForumFeature.toggle(wideForumFeature.isEnabled()),
    toastLabel: "Wide Thread",
  },
  {
    key: "imgRetry",
    text: "Image Retry",
    tooltip: "Enable image retry for broken images in threads",
    config: "threadSettings.imgRetry",
    custom: () => imageRepairFeature.toggle(imageRepairFeature.isEnabled()),
    toastLabel: "Image Retry",
  },
  {
    key: "collapseSignature",
    text: "Collapsable Signatures",
    tooltip: "Make user signatures collapsable in threads",
    config: "threadSettings.collapseSignature",
    custom: () => signatureCollapseFeature.toggle(signatureCollapseFeature.isEnabled()),
    toastLabel: "Collapsable Signatures",
  },
  {
    key: "skipMaskedLink",
    text: "Skip masked link page",
    tooltip:
      "Automatically bypass the masked link intermediary page when accessing masked links \n support with direct download features",
    config: "threadSettings.skipMaskedLink",
    custom: () => toggleHijackMaskedLink(),
    toastLabel: "Skip Masked Link",
  },
];

const THREAD_OVERLAY_TOGGLE_DEFS = [
  {
    key: "marked",
    text: "Show Marked overlay",
    tooltip: "Display marked tags overlay",
    config: "threadSettings.marked",
    toastLabel: "Marked",
  },
  {
    key: "preferred",
    text: "Show Preferred overlay",
    tooltip: "Display your preferred (favorited) overlay",
    config: "threadSettings.preferred",
    toastLabel: "Preferred",
  },
  {
    key: "preferredShadow",
    text: "Preferred overlay shadow",
    tooltip: "Add a subtle shadow effect to preferred overlay",
    config: "threadSettings.preferredShadow",
    toastLabel: "Preferred Shadow",
  },
  {
    key: "excluded",
    text: "Show Excluded overlay",
    tooltip: "Show overlay you've excluded",
    config: "threadSettings.excluded",
    toastLabel: "Excluded",
  },
  {
    key: "excludedShadow",
    text: "Show excluded overlay shadow",
    tooltip: "Add shadow to excluded overlay",
    config: "threadSettings.excludedShadow",
    toastLabel: "Excluded Shadow",
  },
];

const DIRECT_DOWNLOAD_PACKAGE_DEFS = [
  {
    key: "buzzheavierPackage",
    packageKey: "buzzheavier",
    text: "Buzzheavier package",
    tooltip: "Controls buzzheavier.com resolver + trashbytes.net direct link flow",
    toastLabel: "Buzzheavier package",
  },
  {
    key: "gofilePackage",
    packageKey: "gofile",
    text: "Gofile package",
    tooltip: "Controls gofile.io + api.gofile.com flow",
    toastLabel: "Gofile package",
  },
  {
    key: "pixeldrainPackage",
    packageKey: "pixeldrain",
    text: "Pixeldrain",
    tooltip: "Controls pixeldrain.com flow",
    toastLabel: "Pixeldrain",
  },
  {
    key: "datanodesPackage",
    packageKey: "datanodes",
    text: "Datanodes",
    tooltip: "Controls datanodes.to flow",
    toastLabel: "Datanodes",
  },
];

const threadSettingsToggleMeta = buildSettingsMap(
  THREAD_SETTINGS_TOGGLE_DEFS.map(({ key, text, tooltip, config, custom, toastLabel }) => [
    key,
    createToggleSetting({
      text,
      tooltip,
      config,
      custom,
      toast: createEnabledDisabledToast(toastLabel),
    }),
  ]),
);

const threadOverlayToggleMeta = buildSettingsMap(
  THREAD_OVERLAY_TOGGLE_DEFS.map(({ key, text, tooltip, config, toastLabel }) => [
    key,
    createToggleSetting({
      text,
      tooltip,
      config,
      custom: debouncedProcessThreadTags,
      toast: createEnabledDisabledToast(toastLabel),
    }),
  ]),
);

const directDownloadPackageMeta = buildSettingsMap(
  DIRECT_DOWNLOAD_PACKAGE_DEFS.map(({ key, packageKey, text, tooltip, toastLabel }) => [
    key,
    createDirectDownloadPackageSetting({ packageKey, text, tooltip, toastLabel }),
  ]),
);

export const threadSettingsMeta = {
  ...threadSettingsToggleMeta,
  directDownloadSettings: {
    type: "button",
    text: "Direct download settings",
    buttonText: "Open",
    tooltip: "Open per-host direct download package configuration",
    effects: {
      custom: openDirectDownloadSettingsDialog,
    },
  },
  threadOverlaySettings: {
    type: "button",
    text: "Thread overlay settings",
    buttonText: "Open",
    tooltip: "Open thread-page overlay configuration",
    effects: {
      custom: openThreadOverlaySettingsDialog,
    },
  },
};

export const threadOverlaySettingsMeta = {
  threadOverlayToggle: threadOverlayToggleSetting,
  ...threadOverlayToggleMeta,
};

export const directDownloadSettingsMeta = {
  directDownloadLinks: createToggleSetting({
    text: "Direct Download Links",
    tooltip:
      "Enable direct download links for supported file hosts \n works independently outside of masked links",
    config: "threadSettings.directDownloadLinks",
    custom: () => {
      directDownloadFeature.toggle(directDownloadFeature.isEnabled());
      renderDirectDownloadHealthNotices();
      renderDirectDownloadHealthNoticeInDialogIfOpen();
    },
    toast: createEnabledDisabledToast("Direct Download Links"),
  }),
  ...directDownloadPackageMeta,
};
