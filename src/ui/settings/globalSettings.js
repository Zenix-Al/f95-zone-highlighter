import stateManager, { config } from "../../config.js";
import { openConfigTransferDialog } from "../../features/config-transfer/index.js";
import { toggleNoticeDismissal } from "../../features/dismiss-notification";
import { toggleCrossTabSync } from "../../services/syncService";
import { updateButtonVisibility } from "../components/configButton";
import { getAllFeatureStatuses, getRuntimeErrors } from "../../core/featureHealth.js";
import { showToast } from "../components/toast";
import { createEnabledDisabledToast, createToggleSetting } from "./metaFactory";

function summarizeFeatureStatuses(statuses) {
  const counts = { running: 0, disabled: 0, failing: 0, unknown: 0 };
  for (const id in statuses) {
    const status = statuses[id]?.status || "unknown";
    if (counts[status] === undefined) counts.unknown++;
    else counts[status]++;
  }
  return counts;
}

function formatFeatureHealthReport(statuses, counts) {
  const lines = [
    "Feature Health Diagnostic",
    `Timestamp: ${new Date().toISOString()}`,
    `Page: ${window.location.href}`,
    `Summary: running=${counts.running}, disabled=${counts.disabled}, failing=${counts.failing}, unknown=${counts.unknown}`,
    "",
  ];

  const entries = Object.entries(statuses).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) {
    lines.push("No feature status entries found.");
  } else {
    for (const [id, statusObj] of entries) {
      const status = statusObj?.status || "unknown";
      const details = statusObj?.details ? ` - ${statusObj.details}` : "";
      lines.push(`${id}: ${status}${details}`);
      // Include full error history for any feature that recorded failures
      const errorLog = statusObj?.errorLog;
      if (Array.isArray(errorLog) && errorLog.length > 0) {
        for (const entry of errorLog) {
          lines.push(`  [error ${entry.timestamp}] ${entry.details}`);
        }
      }
    }
  }

  // Append unattributed runtime errors captured by the global listener
  const rtErrors = getRuntimeErrors();
  if (rtErrors.length > 0) {
    lines.push("");
    lines.push(`Runtime errors (${rtErrors.length}):`);
    for (const e of rtErrors) {
      lines.push(`  [${e.timestamp}] ${e.details}`);
    }
  }

  return lines.join("\n");
}

async function copyTextToClipboard(text) {
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  } catch {
    return false;
  }
}

export const globalSettingsMeta = {
  configVisibility: createToggleSetting({
    text: "Show configuration button",
    tooltip: "Show or hide the configuration button on the page",
    config: "globalSettings.configVisibility",
    custom: updateButtonVisibility,
    toast: createEnabledDisabledToast("Configuration menu", {
      enabled: "shown",
      disabled: "hidden",
    }),
  }),
  noticeDismissal: createToggleSetting({
    text: "Enable notification dismissal",
    tooltip: "Allow closing notifications by clicking a close button",
    config: "globalSettings.closeNotifOnClick",
    custom: () => {
      toggleNoticeDismissal();
    },
    toast: createEnabledDisabledToast("Notification dismissal"),
  }),
  enableCrossTabSync: createToggleSetting({
    text: "Sync settings across tabs",
    tooltip:
      "Automatically apply changes made in other tabs(requires to refresh other tabs) experimental",
    config: "globalSettings.enableCrossTabSync",
    custom: () => {
      toggleCrossTabSync(config.globalSettings.enableCrossTabSync);
    },
    toast: createEnabledDisabledToast("(experimental)Cross-tab settings sync"),
  }),
  configTransfer: {
    type: "button",
    text: "Import / export settings",
    buttonText: "Open",
    tooltip: "Open JSON import/export tools",
    onClick: openConfigTransferDialog,
  },
  featureHealth: {
    type: "button",
    text: "Feature health",
    buttonText: "Run check",
    tooltip: "Run a diagnostic that reports feature running/disabled/failing states",
    onClick: () => {
      const statuses = getAllFeatureStatuses();
      const counts = summarizeFeatureStatuses(statuses);
      const reportText = formatFeatureHealthReport(statuses, counts);

      showToast(
        `Feature health - running: ${counts.running}, disabled: ${counts.disabled}, failing: ${counts.failing}, unknown: ${counts.unknown}`,
      );

      try {
        const shadow = stateManager.get("shadowRoot");
        if (!shadow) return;
        const container = shadow.getElementById("global-settings-container");
        if (!container) return;

        let box = shadow.getElementById("feature-health-box");
        if (!box) {
          box = document.createElement("div");
          box.id = "feature-health-box";
          box.className = "feature-health-box";

          const header = document.createElement("div");
          header.className = "feature-health-header";

          const title = document.createElement("div");
          title.className = "feature-health-title";
          title.textContent = "Diagnostic";

          const actions = document.createElement("div");
          actions.className = "feature-health-actions";

          const copyBtn = document.createElement("button");
          copyBtn.className = "feature-health-close";
          copyBtn.type = "button";
          copyBtn.textContent = "Copy";
          copyBtn.title = "Copy diagnostic as plain text";
          copyBtn.addEventListener("click", async () => {
            const payload = box.dataset.copyPayload || "";
            if (!payload) {
              showToast("No diagnostic data to copy.");
              return;
            }
            const copied = await copyTextToClipboard(payload);
            showToast(copied ? "Feature health copied." : "Copy failed.");
          });

          const closeBtn = document.createElement("button");
          closeBtn.className = "feature-health-close";
          closeBtn.type = "button";
          closeBtn.textContent = "Close";
          closeBtn.title = "Dismiss diagnostic";
          closeBtn.addEventListener("click", () => {
            box.style.display = "none";
          });

          actions.appendChild(copyBtn);
          actions.appendChild(closeBtn);
          header.appendChild(title);
          header.appendChild(actions);
          box.appendChild(header);

          const content = document.createElement("div");
          content.className = "feature-health-content";
          box.appendChild(content);

          container.appendChild(box);
        }

        const content = box.querySelector(".feature-health-content");
        content.innerHTML = "";
        const entries = Object.entries(statuses).sort(([a], [b]) => a.localeCompare(b));
        for (const [id, s] of entries) {
          const line = document.createElement("div");
          line.className = "feature-health-line";
          line.textContent = `${id}: ${s.status}${s.details ? " - " + s.details : ""}`;
          content.appendChild(line);

          // Show error history under each feature that has recorded failures
          const errorLog = s?.errorLog;
          if (Array.isArray(errorLog) && errorLog.length > 0) {
            for (const entry of errorLog) {
              const errLine = document.createElement("div");
              errLine.className = "feature-health-line";
              errLine.style.cssText = "padding-left:14px;font-size:11px;opacity:0.75;";
              errLine.textContent = `\u2937 [${entry.timestamp.slice(11, 19)}] ${entry.details}`;
              content.appendChild(errLine);
            }
          }
        }

        // Show unattributed runtime errors caught by global listener
        const rtErrors = getRuntimeErrors();
        if (rtErrors.length > 0) {
          const sep = document.createElement("div");
          sep.className = "feature-health-line";
          sep.style.cssText = "margin-top:6px;font-weight:bold;";
          sep.textContent = `Runtime errors (${rtErrors.length})`;
          content.appendChild(sep);
          for (const e of rtErrors) {
            const errLine = document.createElement("div");
            errLine.className = "feature-health-line";
            errLine.style.cssText = "padding-left:14px;font-size:11px;opacity:0.75;";
            errLine.textContent = `[${e.timestamp.slice(11, 19)}] ${e.details}`;
            content.appendChild(errLine);
          }
        }

        box.dataset.copyPayload = reportText;
        box.style.display = "block";
      } catch (err) {
        console.error("Feature health UI failed", err);
      }
    },
  },
};
