import stateManager, { config } from "../../config.js";
import { toggleNoticeDismissal } from "../../features/dismiss-notification";
import { toggleCrossTabSync } from "../../services/syncService";
import { updateButtonVisibility } from "../components/configButton";
import { getAllFeatureStatuses } from "../../core/featureHealth.js";
import { showToast } from "../components/toast";

export const globalSettingsMeta = {
  configVisibility: {
    type: "toggle",
    text: "Show configuration button",
    tooltip: "Show or hide the configuration button on the page",
    config: "globalSettings.configVisibility",
    effects: {
      custom: updateButtonVisibility,
      toast: (v) => `Configuration menu ${v ? "shown" : "hidden"}`,
    },
  },
  noticeDismissal: {
    type: "toggle",
    text: "Enable notification dismissal",
    tooltip: "Allow closing notifications by clicking a close button",
    config: "globalSettings.closeNotifOnClick",
    effects: {
      custom: () => {
        toggleNoticeDismissal();
      },
      toast: (v) => `Notification dismissal ${v ? "enabled" : "disabled"}`,
    },
  },
  enableCrossTabSync: {
    type: "toggle",
    text: "Sync settings across tabs",
    tooltip:
      "Automatically apply changes made in other tabs(requires to refresh other tabs) experimental",
    config: "globalSettings.enableCrossTabSync",
    effects: {
      custom: () => {
        toggleCrossTabSync(config.globalSettings.enableCrossTabSync);
      },
      toast: (v) => `(experimental)Cross-tab settings sync ${v ? "enabled" : "disabled"}`,
    },
  },
  featureHealth: {
    type: "button",
    text: "Feature health",
    buttonText: "Run check",
    tooltip: "Run a diagnostic that reports feature running/disabled/failing states",
    onClick: () => {
      const statuses = getAllFeatureStatuses();
      const counts = { running: 0, disabled: 0, failing: 0, unknown: 0 };

      for (const id in statuses) {
        const s = statuses[id].status || "unknown";
        if (counts[s] === undefined) counts.unknown++;
        else counts[s]++;
      }

      showToast(
        `Feature health - running: ${counts.running}, disabled: ${counts.disabled}, failing: ${counts.failing}`,
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

          const closeBtn = document.createElement("button");
          closeBtn.className = "feature-health-close";
          closeBtn.type = "button";
          closeBtn.textContent = "Close";
          closeBtn.title = "Dismiss diagnostic";
          closeBtn.addEventListener("click", () => {
            box.style.display = "none";
          });

          header.appendChild(title);
          header.appendChild(closeBtn);
          box.appendChild(header);

          const content = document.createElement("div");
          content.className = "feature-health-content";
          box.appendChild(content);

          container.appendChild(box);
        }

        const content = box.querySelector(".feature-health-content");
        content.innerHTML = "";
        for (const id in statuses) {
          const s = statuses[id];
          const line = document.createElement("div");
          line.className = "feature-health-line";
          line.textContent = `${id}: ${s.status}${s.details ? " - " + s.details : ""}`;
          content.appendChild(line);
        }
        box.style.display = "block";
      } catch (err) {
        console.error("Feature health UI failed", err);
      }
    },
  },
};
