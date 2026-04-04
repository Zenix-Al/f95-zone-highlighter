import { createEl } from "../../../core/dom.js";
import { showToast } from "../../components/toast";
import { getRuntimeErrors, getAllFeatureStatuses } from "../../../core/featureHealth.js";
import stateManager from "../../../config.js";
import { listKnownAddons } from "../../../services/addonsService.js";

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
    const addonEntries = getInstalledAddonHealthEntries();

    function getInstalledAddonHealthEntries() {
      try {
        return listKnownAddons()
          .filter((addon) => addon && addon.status !== "not-installed")
          .map((addon) => ({
            id: String(addon.id || "").trim(),
            name: String(addon.name || addon.id || "Unknown Add-on").trim(),
            status: String(addon.status || "unknown").trim() || "unknown",
            statusMessage: String(addon.statusMessage || "").trim(),
            activeOnPage: Boolean(addon.activeOnPage),
            supportsCurrentPage: addon.supportsCurrentPage !== false,
            blocked: Boolean(addon.blocked),
            trusted: Boolean(addon.trusted),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
      } catch {
        return [];
      }
    }

    function summarizeFeatureStatuses(statusesArg) {
      const counts = { running: 0, disabled: 0, failing: 0, unknown: 0 };
      for (const id in statusesArg) {
        const status = statusesArg[id]?.status || "unknown";
        if (counts[status] === undefined) counts.unknown++;
        else counts[status]++;
      }
      return counts;
    }

    function summarizeAddons(entries) {
      const counts = {
        totalInstalled: entries.length,
        installed: 0,
        disabled: 0,
        "needs-update": 0,
        error: 0,
        broken: 0,
        unknown: 0,
        activeOnPage: 0,
        scopeMatchesPage: 0,
      };

      for (const addon of entries) {
        const status = addon?.status || "unknown";
        if (Object.prototype.hasOwnProperty.call(counts, status)) {
          counts[status] += 1;
        } else {
          counts.unknown += 1;
        }
        if (addon.activeOnPage) counts.activeOnPage += 1;
        if (addon.supportsCurrentPage) counts.scopeMatchesPage += 1;
      }

      return {
        ...counts,
        healthy: counts.installed + counts.disabled,
        failing: counts.error + counts.broken,
        degraded: counts["needs-update"],
      };
    }

    function formatFeatureHealthReport(statusesArg, countsArg, addonEntriesArg, addonCountsArg) {
      const lines = [
        "Feature Health Diagnostic",
        `Timestamp: ${new Date().toISOString()}`,
        `Page: ${window.location.href}`,
        `Summary: running=${countsArg.running}, disabled=${countsArg.disabled}, failing=${countsArg.failing}, unknown=${countsArg.unknown}`,
        `Add-ons (installed): total=${addonCountsArg.totalInstalled}, healthy=${addonCountsArg.healthy}, failing=${addonCountsArg.failing}, degraded=${addonCountsArg.degraded}, scoped-to-page=${addonCountsArg.scopeMatchesPage}, active-here=${addonCountsArg.activeOnPage}`,
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

      lines.push("");
      lines.push("Add-on Health (installed only):");
      if (addonEntriesArg.length === 0) {
        lines.push("No installed add-ons detected.");
      } else {
        for (const addon of addonEntriesArg) {
          const statusBits = [];
          statusBits.push(addon.activeOnPage ? "active-here" : "inactive-here");
          statusBits.push(addon.supportsCurrentPage ? "scope-match" : "scope-mismatch");
          statusBits.push(addon.trusted ? "trusted" : "untrusted");
          if (addon.blocked) statusBits.push("blocked");
          const details = addon.statusMessage ? ` - ${addon.statusMessage}` : "";
          lines.push(
            `${addon.name} (${addon.id}): ${addon.status} [${statusBits.join(", ")}]${details}`,
          );
        }
      }

      return lines.join("\n");
    }

    const counts = summarizeFeatureStatuses(statuses);
    const addonCounts = summarizeAddons(addonEntries);
    const reportText =
      providedReportText || formatFeatureHealthReport(statuses, counts, addonEntries, addonCounts);
    showToast(
      `Feature health - running: ${counts.running}, disabled: ${counts.disabled}, failing: ${counts.failing}, unknown: ${counts.unknown} | add-ons installed: ${addonCounts.totalInstalled}, healthy: ${addonCounts.healthy}, failing: ${addonCounts.failing}, degraded: ${addonCounts.degraded}`,
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

    function renderContent(boxEl, statusesArg, addonEntriesArg) {
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

      content.appendChild(
        createEl("div", {
          className: "feature-health-line feature-health-sep",
          text: `Add-on health (installed only: ${addonEntriesArg.length})`,
        }),
      );

      if (addonEntriesArg.length === 0) {
        content.appendChild(
          createEl("div", {
            className: "feature-health-line",
            text: "No installed add-ons detected.",
          }),
        );
        return;
      }

      for (const addon of addonEntriesArg) {
        const tags = [];
        tags.push(addon.activeOnPage ? "active-here" : "inactive-here");
        tags.push(addon.supportsCurrentPage ? "scope-match" : "scope-mismatch");
        if (addon.blocked) tags.push("blocked");

        const lineClass =
          addon.status === "error" || addon.status === "broken"
            ? "feature-health-line feature-health-error"
            : "feature-health-line";
        const details = addon.statusMessage ? ` - ${addon.statusMessage}` : "";
        content.appendChild(
          createEl("div", {
            className: lineClass,
            text: `${addon.name}: ${addon.status} [${tags.join(", ")}]${details}`,
          }),
        );
      }
    }

    const box = ensureBox();
    renderContent(box, statuses || {}, addonEntries);
    if (reportText) box.dataset.copyPayload = reportText;
    box.style.display = "block";
    return box;
  } catch (err) {
    console.error("showFeatureHealthBox failed", err);
  }
}
