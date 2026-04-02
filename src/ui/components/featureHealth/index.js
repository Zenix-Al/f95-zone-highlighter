import { createEl } from "../../../core/dom.js";
import { showToast } from "../../components/toast";
import { getRuntimeErrors, getAllFeatureStatuses } from "../../../core/featureHealth.js";
import stateManager from "../../../config.js";

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
    textarea.className = "offscreen-copy";
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

export function showFeatureHealthBox(providedStatuses, providedReportText) {
  try {
    const statuses = providedStatuses || getAllFeatureStatuses();

    function summarizeFeatureStatuses(statusesArg) {
      const counts = { running: 0, disabled: 0, failing: 0, unknown: 0 };
      for (const id in statusesArg) {
        const status = statusesArg[id]?.status || "unknown";
        if (counts[status] === undefined) counts.unknown++;
        else counts[status]++;
      }
      return counts;
    }

    function formatFeatureHealthReport(statusesArg, countsArg) {
      const lines = [
        "Feature Health Diagnostic",
        `Timestamp: ${new Date().toISOString()}`,
        `Page: ${window.location.href}`,
        `Summary: running=${countsArg.running}, disabled=${countsArg.disabled}, failing=${countsArg.failing}, unknown=${countsArg.unknown}`,
        "",
      ];

      const entries = Object.entries(statusesArg).sort(([a], [b]) => a.localeCompare(b));
      if (entries.length === 0) {
        lines.push("No feature status entries found.");
      }

      for (const [id, statusObj] of entries) {
        const status = statusObj?.status || "unknown";
        const details = statusObj?.details ? ` - ${statusObj.details}` : "";
        lines.push(`${id}: ${status}${details}`);

        const errorLog = Array.isArray(statusObj?.errorLog) ? statusObj.errorLog : [];
        for (const entry of errorLog) {
          lines.push(`  [error ${entry.timestamp}] ${entry.details}`);
        }
      }

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

    const counts = summarizeFeatureStatuses(statuses);
    const reportText = providedReportText || formatFeatureHealthReport(statuses, counts);
    showToast(
      `Feature health - running: ${counts.running}, disabled: ${counts.disabled}, failing: ${counts.failing}, unknown: ${counts.unknown}`,
    );

    const shadow = stateManager.get("shadowRoot") || window.__LATEST_HIGHLIGHTER_SHADOW__ || null;
    const root = shadow || document;
    const container = root.getElementById("global-settings-container");
    if (!container) return;

    function ensureBox() {
      let box = root.getElementById("feature-health-box");
      if (box) return box;

      const copyBtn = createEl("button", {
        className: "feature-health-close",
        text: "Copy",
      });
      copyBtn.type = "button";
      copyBtn.title = "Copy diagnostic as plain text";

      const closeBtn = createEl("button", {
        className: "feature-health-close",
        text: "Close",
      });
      closeBtn.type = "button";
      closeBtn.title = "Dismiss diagnostic";

      const actions = createEl("div", {
        className: "feature-health-actions",
        children: [copyBtn, closeBtn],
      });
      const title = createEl("div", { className: "feature-health-title", text: "Diagnostic" });
      const header = createEl("div", {
        className: "feature-health-header",
        children: [title, actions],
      });

      const content = createEl("div", { className: "feature-health-content" });

      const boxEl = createEl("div", { className: "feature-health-box" });
      boxEl.id = "feature-health-box";
      boxEl.appendChild(header);
      boxEl.appendChild(content);

      copyBtn.addEventListener("click", async () => {
        const payload = boxEl.dataset.copyPayload || "";
        if (!payload) {
          showToast("No diagnostic data to copy.");
          return;
        }
        const copied = await copyTextToClipboard(payload);
        showToast(copied ? "Feature health copied." : "Copy failed.");
      });

      closeBtn.addEventListener("click", () => {
        boxEl.style.display = "none";
      });

      container.appendChild(boxEl);
      return boxEl;
    }

    function renderContent(boxEl, statusesArg) {
      const content = boxEl.querySelector(".feature-health-content");
      content.innerHTML = "";

      const entries = Object.entries(statusesArg).sort(([a], [b]) => a.localeCompare(b));
      for (const [id, s] of entries) {
        const line = createEl("div", {
          className: "feature-health-line",
          text: `${id}: ${s.status}${s.details ? " - " + s.details : ""}`,
        });
        content.appendChild(line);

        const errorLog = Array.isArray(s?.errorLog) ? s.errorLog : [];
        for (const entry of errorLog) {
          content.appendChild(
            createEl("div", {
              className: "feature-health-line feature-health-error",
              text: `\u2937 [${entry.timestamp.slice(11, 19)}] ${entry.details}`,
            }),
          );
        }
      }

      const rtErrors = getRuntimeErrors();
      if (rtErrors.length > 0) {
        content.appendChild(
          createEl("div", {
            className: "feature-health-line feature-health-sep",
            text: `Runtime errors (${rtErrors.length})`,
          }),
        );
        for (const e of rtErrors) {
          content.appendChild(
            createEl("div", {
              className: "feature-health-line feature-health-error",
              text: `[${e.timestamp.slice(11, 19)}] ${e.details}`,
            }),
          );
        }
      }
    }

    const box = ensureBox();
    renderContent(box, statuses || {});
    if (reportText) box.dataset.copyPayload = reportText;
    box.style.display = "block";
    return box;
  } catch (err) {
    console.error("showFeatureHealthBox failed", err);
  }
}
