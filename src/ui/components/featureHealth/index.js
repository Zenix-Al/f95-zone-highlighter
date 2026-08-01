import { createEl } from "../../../utils/dom.js";
import { showToast } from "../../components/toast";
import {
  getHealthDiagnostics,
  getRuntimeErrors,
  getAllFeatureStatuses,
} from "../../../core/featureHealth.js";
import { stateManager } from "../../../config.js";
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

export function summarizeFeatureStatuses(statuses) {
  const counts = { running: 0, disabled: 0, degraded: 0, failing: 0, unknown: 0 };
  for (const statusObj of Object.values(statuses || {})) {
    const status = statusObj?.status || "unknown";
    if (counts[status] === undefined) counts.unknown++;
    else counts[status]++;
  }
  return counts;
}

export function summarizeAddons(entries) {
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
    if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status]++;
    else counts.unknown++;
    if (addon.activeOnPage) counts.activeOnPage++;
    if (addon.supportsCurrentPage) counts.scopeMatchesPage++;
  }
  return {
    ...counts,
    healthy: counts.installed + counts.disabled,
    failing: counts.error + counts.broken,
    degraded: counts["needs-update"],
  };
}

export function formatFeatureHealthReport(
  statuses,
  counts,
  addonEntries,
  addonCounts,
  {
    diagnostics = getHealthDiagnostics(),
    runtimeErrors = getRuntimeErrors(),
    timestamp = new Date().toISOString(),
    page = window.location.href,
  } = {},
) {
  const resources = diagnostics.snapshots?.resources || {};
  const queues = diagnostics.snapshots?.queues || {};
  const lines = [
    "Feature Health Diagnostic",
    `Timestamp: ${timestamp}`,
    `Page: ${page}`,
    `Summary: running=${counts.running}, disabled=${counts.disabled}, degraded=${counts.degraded}, failing=${counts.failing}, unknown=${counts.unknown}`,
    `Add-ons (installed): total=${addonCounts.totalInstalled}, healthy=${addonCounts.healthy}, failing=${addonCounts.failing}, degraded=${addonCounts.degraded}, scoped-to-page=${addonCounts.scopeMatchesPage}, active-here=${addonCounts.activeOnPage}`,
    `Resources: total=${resources.totalResources || 0}, owners=${resources.ownerCount || 0}; Queues: total=${queues.queueCount || 0}, pending=${queues.pendingCount || 0}, running=${queues.runningCount || 0}`,
    "",
  ];

  const entries = Object.entries(statuses || {}).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) lines.push("No feature status entries found.");
  for (const [id, statusObj] of entries) {
    const details = statusObj?.details ? ` - ${statusObj.details}` : "";
    lines.push(`${id}: ${statusObj?.status || "unknown"}${details}`);
    for (const error of Array.isArray(statusObj?.errorLog) ? statusObj.errorLog : []) {
      lines.push(`  [error ${error.timestamp}] ${error.details}`);
    }
  }

  if (runtimeErrors.length > 0) {
    lines.push("", `Runtime errors (${runtimeErrors.length}):`);
    for (const error of runtimeErrors) lines.push(`  [${error.timestamp}] ${error.details}`);
  }

  lines.push("", "Add-on Health (installed only):");
  if (addonEntries.length === 0) {
    lines.push("No installed add-ons detected.");
  } else {
    for (const addon of addonEntries) {
      const statusBits = [
        addon.activeOnPage ? "active-here" : "inactive-here",
        addon.supportsCurrentPage ? "scope-match" : "scope-mismatch",
        addon.trusted ? "trusted" : "untrusted",
      ];
      if (addon.blocked) statusBits.push("blocked");
      const details = addon.statusMessage ? ` - ${addon.statusMessage}` : "";
      lines.push(`${addon.name} (${addon.id}): ${addon.status} [${statusBits.join(", ")}]${details}`);
    }
  }
  return lines.join("\n");
}

function ensureBox(root, container) {
  let box = root.getElementById("feature-health-box");
  if (box) return box;

  const copyBtn = createEl("button", { className: "feature-health-close", text: "Copy" });
  copyBtn.type = "button";
  copyBtn.title = "Copy diagnostic as plain text";
  const closeBtn = createEl("button", { className: "feature-health-close", text: "Close" });
  closeBtn.type = "button";
  closeBtn.title = "Dismiss diagnostic";
  const actions = createEl("div", {
    className: "feature-health-actions",
    children: [copyBtn, closeBtn],
  });
  const header = createEl("div", {
    className: "feature-health-header",
    children: [
      createEl("div", { className: "feature-health-title", text: "Diagnostic" }),
      actions,
    ],
  });
  const content = createEl("pre", { className: "feature-health-content" });
  box = createEl("div", { className: "feature-health-box", children: [header, content] });
  box.id = "feature-health-box";

  copyBtn.addEventListener("click", async () => {
    const payload = content.textContent || "";
    if (!payload) {
      showToast("No diagnostic data to copy.");
      return;
    }
    const copied = await copyTextToClipboard(payload);
    showToast(copied ? "Feature health copied." : "Copy failed.");
  });
  closeBtn.addEventListener("click", () => {
    box.style.display = "none";
  });
  container.appendChild(box);
  return box;
}

export function showFeatureHealthBox(providedStatuses, providedReportText) {
  try {
    const statuses = providedStatuses || getAllFeatureStatuses();
    const addonEntries = getInstalledAddonHealthEntries();
    const counts = summarizeFeatureStatuses(statuses);
    const addonCounts = summarizeAddons(addonEntries);
    const reportText = providedReportText
      || formatFeatureHealthReport(statuses, counts, addonEntries, addonCounts);

    showToast(
      `Feature health - running: ${counts.running}, disabled: ${counts.disabled}, degraded: ${counts.degraded}, failing: ${counts.failing}, unknown: ${counts.unknown} | add-ons installed: ${addonCounts.totalInstalled}, healthy: ${addonCounts.healthy}, failing: ${addonCounts.failing}, degraded: ${addonCounts.degraded}`,
    );

    const shadow = stateManager.get("shadowRoot") || window.__LATEST_HIGHLIGHTER_SHADOW__ || null;
    const root = shadow || document;
    const container = root.getElementById("global-settings-container");
    if (!container) return;

    const box = ensureBox(root, container);
    box.querySelector(".feature-health-content").textContent = reportText;
    box.style.display = "block";
    return box;
  } catch (err) {
    console.error("showFeatureHealthBox failed", err);
  }
}
