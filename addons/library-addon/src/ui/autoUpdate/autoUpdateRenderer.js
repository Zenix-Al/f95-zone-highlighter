import cssTemplate from "./autoUpdate.css";

const count = (value) => Math.max(0, Number(value) || 0);
const time = (value) => value ? new Date(value).toLocaleString() : "-";
const localDayKey = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export function getAutoUpdateStyleText(root = ".f95ue-library-auto-dialog") {
  return cssTemplate.replaceAll("__ROOT__", root);
}

export function derivePrimaryUpdateAction(
  cycle,
  { running = false, recoveryPending = false } = {},
) {
  if (recoveryPending) {
    return { action: "", label: "Waiting for previous process...", disabled: true };
  }
  if (running) return { action: "", label: "Updating...", disabled: true };
  if (!cycle) return { action: "run-now", label: "Update now", disabled: false };
  if (cycle.status === "preparing") return { action: "", label: "Preparing...", disabled: true };
  if (cycle.status === "running") return { action: "", label: "Updating...", disabled: true };
  if (cycle.status === "recovering") return { action: "", label: "Recovering...", disabled: true };
  if (cycle.status === "completed") {
    if (cycle.nextRunAt && cycle.nextRunAt <= Date.now()) {
      return { action: "run-now", label: "Update now", disabled: false };
    }
    return { action: "check-again", label: "Check again...", disabled: false };
  }
  if (cycle.status === "paused") return { action: "resume", label: "Resume updates", disabled: false };
  const localDay = localDayKey();
  const staleDay = Boolean(cycle.dailyKey && cycle.dailyKey !== localDay);
  const limit = count(cycle.checksPerDay) + (staleDay ? 0 : count(cycle.dailyBonusAllowance));
  if (!staleDay && count(cycle.dailyAttempted) >= limit && count(cycle.completed) + count(cycle.failed) < count(cycle.total)) {
    return { action: "continue-batch", label: "Continue another batch...", disabled: false };
  }
  return { action: "resume", label: "Resume updates", disabled: false };
}

export function createAutoUpdateDiagnostics(cycle) {
  if (!cycle) return "Library auto update\nState: idle\nCycle: none";
  return ["Library auto update", `State: ${cycle.status}`, `Cycle: ${cycle.cycleId}`, `Progress: ${count(cycle.completed)} / ${count(cycle.total)}`, `Today: ${count(cycle.dailyAttempted)} / ${count(cycle.checksPerDay) + count(cycle.dailyBonusAllowance)}`, `Current: ${count(cycle.current)}; changed: ${count(cycle.changed)}; retry: ${count(cycle.retryPending)}; terminal: ${count(cycle.failed)}; skipped: ${count(cycle.skipped)}`, `Network retries: ${count(cycle.networkRetries)}`, `Current item: ${cycle.currentThreadId || "-"} @ ${count(cycle.currentPosition) || "-"}`, `Next wake: ${cycle.nextRunAt || 0}`, `Updated: ${cycle.updatedAt || 0}`].join("\n").slice(0, 2000);
}

export function patchAutoUpdateView(root, cycle, runtime = {}) {
  if (!root) return;
  const set = (role, value) => { const node = root.querySelector(`[data-role="${role}"]`); if (node) node.textContent = String(value); };
  const total = count(cycle?.total);
  const completed = count(cycle?.completed);
  const staleDay = Boolean(cycle?.dailyKey && cycle.dailyKey !== localDayKey());
  const limit = count(cycle?.checksPerDay) + (staleDay ? 0 : count(cycle?.dailyBonusAllowance));
  set("state", runtime.recoveryPending
    ? "WAITING FOR PREVIOUS PROCESS"
    : String(cycle?.status || "idle").toUpperCase());
  set("cycleProgress", `${completed} / ${total}`);
  set("dailyProgress", `${staleDay ? 0 : count(cycle?.dailyAttempted)} / ${limit || runtime.checksPerDay || 0}`);
  set("completed", completed);
  set("retryPending", count(cycle?.retryPending));
  set("terminalFailed", count(cycle?.failed));
  set("nextWake", time(runtime.recoveryPending ? runtime.recoveryAt : cycle?.nextRunAt));
  set("lastActivity", time(cycle?.updatedAt));
  set("currentItem", cycle?.currentThreadId ? `${cycle.currentPosition || "-"}. ${cycle.currentThreadId}` : "-");
  set("cycleId", cycle?.cycleId || "-");
  set("cycleCounts", `current ${count(cycle?.current)} · changed ${count(cycle?.changed)} · skipped ${count(cycle?.skipped)} · network retries ${count(cycle?.networkRetries)}`);
  const progress = root.querySelector('[data-role="progress"]');
  if (progress) { progress.max = Math.max(1, total); progress.value = completed; }
  const primary = root.querySelector('[data-role="primaryAction"]');
  if (primary) {
    const state = derivePrimaryUpdateAction(cycle, runtime);
    primary.textContent = state.label;
    primary.disabled = state.disabled;
    primary.dataset.autoAction = state.action;
    primary.setAttribute("aria-label", state.label);
  }
  const pause = root.querySelector('[data-auto-action="pause"]');
  if (pause) pause.hidden = !runtime.running || !cycle || ["completed", "paused"].includes(cycle.status);
}

export function renderAutoUpdateDialog(config, cycle) {
  const field = (label, name, value, min, max) => `<label><span>${label}</span><input name="${name}" type="number" min="${min}" max="${max}" value="${escapeHtml(value)}"></label>`;
  const primary = derivePrimaryUpdateAction(cycle);
  return `<form class="f95ue-library-auto-dialog" data-role="auto-update-dialog"><section class="f95ue-library-auto-overview"><div class="f95ue-library-auto-heading"><strong>Update overview</strong><span class="f95ue-library-auto-state" data-role="state">IDLE</span></div><progress data-role="progress" max="1" value="0"></progress><div class="f95ue-library-auto-stats"><span>Cycle <strong data-role="cycleProgress">0 / 0</strong></span><span>Today <strong data-role="dailyProgress">0 / ${config.checksPerDay}</strong></span><span>Completed <strong data-role="completed">0</strong></span><span>Retry pending <strong data-role="retryPending">0</strong></span><span>Terminal <strong data-role="terminalFailed">0</strong></span></div><div class="f95ue-library-auto-meta"><span>Current: <b data-role="currentItem">-</b></span><span>Next: <b data-role="nextWake">-</b></span><span>Last activity: <b data-role="lastActivity">-</b></span></div></section><details><summary>Cycle details &gt;</summary><div class="f95ue-library-auto-details"><div>Cycle ID: <span data-role="cycleId">-</span></div><div data-role="cycleCounts">current 0 · changed 0 · skipped 0 · network retries 0</div><button type="button" data-auto-action="copy-diagnostics">Copy diagnostics</button><button type="button" data-auto-action="restart">Restart cycle...</button></div></details><details><summary>Update settings &gt;</summary><div class="f95ue-library-auto-grid"><label class="f95ue-library-auto-toggle"><input name="enabled" type="checkbox"${config.enabled !== false ? " checked" : ""}><span>Check eligible Library records automatically</span></label>${field("Checks per day", "checksPerDay", config.checksPerDay, 1, 500)}${field("Update hour (local, 0-23)", "runHour", config.runHour, 0, 23)}${field("Spacing (ms)", "spacingMs", config.spacingMs, 5000, 30000)}${field("Timeout (ms)", "timeoutMs", config.timeoutMs, 1000, 30000)}${field("Retries", "retryLimit", config.retryLimit, 0, 5)}<button type="submit" class="primary">Save settings</button></div></details><div class="f95ue-library-auto-actions"><button type="button" class="primary" data-role="primaryAction" data-auto-action="${primary.action}"${primary.disabled ? " disabled" : ""}>${primary.label}</button><button type="button" data-auto-action="pause">Pause</button><button type="button" data-auto-action="cancel">Close</button></div></form>`;
}
