import cssTemplate from "./autoUpdate.css";
import { LIBRARY_MIN_UPDATE_SPACING_MS } from "../../constants.js";
import { formatRecentUpdateErrors } from "../../library/updateErrorLog.js";

const count = (value) => Math.max(0, Number(value) || 0);
const time = (value) => (value ? new Date(value).toLocaleString() : "-");
const localDayKey = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const SITE_BLOCK_LABELS = {
  challenge_page: "F95 browser check",
  rate_limited: "F95 rate limit",
};

export function getSiteBlockLabel(cycle) {
  if (!(Number(cycle?.blockedUntil) > Date.now())) return "";
  return SITE_BLOCK_LABELS[cycle.blockedReason] || "F95 blocked requests";
}

export function getAutoUpdateStyleText(root = ".f95ue-library-auto-dialog") {
  return cssTemplate.replaceAll("__ROOT__", root);
}

export function derivePrimaryUpdateAction(
  cycle,
  { running = false, recoveryPending = false } = {},
) {
  if (running) return { action: "", label: "Updating...", disabled: true };
  if (recoveryPending) {
    return {
      action: "",
      label: "Waiting for previous process...",
      disabled: true,
    };
  }
  if (!cycle)
    return { action: "run-now", label: "Update now", disabled: false };
  if (cycle.status === "preparing")
    return { action: "", label: "Preparing...", disabled: true };
  if (cycle.status === "running")
    return { action: "", label: "Updating...", disabled: true };
  if (cycle.status === "recovering")
    return { action: "", label: "Recovering...", disabled: true };
  if (cycle.status === "completed") {
    if (cycle.nextRunAt && cycle.nextRunAt <= Date.now()) {
      return { action: "run-now", label: "Update now", disabled: false };
    }
    return { action: "check-again", label: "Check again...", disabled: false };
  }
  if (cycle.status === "paused")
    return { action: "resume", label: "Resume updates", disabled: false };
  if (getSiteBlockLabel(cycle))
    return { action: "retry-now", label: "Retry now", disabled: false };
  const localDay = localDayKey();
  const staleDay = Boolean(cycle.dailyKey && cycle.dailyKey !== localDay);
  const limit = count(cycle.checksPerDay);
  if (
    !staleDay &&
    count(cycle.dailyAttempted) >= limit &&
    count(cycle.completed) + count(cycle.failed) < count(cycle.total)
  ) {
    return {
      action: "",
      label: "Daily allowance reached",
      disabled: true,
    };
  }
  return { action: "resume", label: "Resume updates", disabled: false };
}

const SOURCE_REASONS = {
  query_unusable: "no usable search terms",
  id_not_found: "saved thread ID not found", conflicting_matches: "ambiguous rows",
  missing_facts: "missing facts", mapping_incomplete: "mapping incomplete",
  invalid_facts: "invalid facts", invalid_response: "invalid response",
  catalog_unavailable: "cached catalogs unavailable", api_exhausted: "hourly allowance exhausted",
  api_suppressed: "API temporarily suppressed", challenge_page: "API browser check",
  rate_limited: "API rate limit", timeout: "API timeout", network_error: "API network failure",
  response_too_large: "API response too large", html_retry: "HTML retry", html_only: "HTML-only setting",
};

export function describeHybridStatus(status, preferLatestApi = false, now = Date.now()) {
  const value = status?.ok ? status.value : null;
  const last = status?.lastCheck;
  const source = !last ? "No check in this tab session"
    : `${last.source === "latest-api" ? "Latest API: ID match" : `Thread HTML: ${SOURCE_REASONS[last.fallbackReason] || "API failure"}`} (${last.ok ? "fetched" : "failed"})`;
  const mode = preferLatestApi ? "API-first; thread HTML fallback (search coverage is not guaranteed)" : "Thread HTML only";
  return {
    mode,
    usage: value ? `${count(value.used)} / ${count(value.limit)} updater-accounted requests this UTC clock hour` : "API accounting unavailable",
    availability: !value ? "Shared budget status unavailable; this is not a server quota reading"
      : value.siteBlockedUntil > now ? `Both sources paused (${SITE_BLOCK_LABELS[value.siteBlockedReason] || "site block"}) until ${time(value.siteBlockedUntil)}`
        : value.apiBlockedUntil > now ? `API suppressed (${SITE_BLOCK_LABELS[value.apiBlockedReason] || "API block"}) until ${time(value.apiBlockedUntil)}; HTML remains eligible`
          : value.remaining === 0 ? `API allowance exhausted; HTML remains eligible. API next eligible: ${time(value.nextApiAt)}`
            : `API next eligible: ${time(value.nextApiAt)}`,
    source,
  };
}

export function createAutoUpdateDiagnostics(cycle, status, preferLatestApi = false, errors) {
  const hybrid = describeHybridStatus(status, preferLatestApi);
  const lines = ["Library auto update", `Mode: ${hybrid.mode}`, hybrid.usage, hybrid.availability,
    `Last local fetch: ${hybrid.source}`, "Accounting excludes ordinary browsing and other scripts; not F95's remaining quota."];
  if (!cycle) return [...lines, "State: idle", "Cycle: none", ...formatRecentUpdateErrors(errors)].join("\n");
  return [
    ...lines,
    `State: ${cycle.status}`,
    `Cycle: ${cycle.cycleId}`,
    `Progress: ${count(cycle.completed)} / ${count(cycle.total)}`,
    `Today: ${count(cycle.dailyAttempted)} / ${count(cycle.checksPerDay)}`,
    `Current: ${count(cycle.current)}; changed: ${count(cycle.changed)}; retry: ${count(cycle.retryPending)}; terminal: ${count(cycle.failed)}; skipped: ${count(cycle.skipped)}`,
    `Network retries: ${count(cycle.networkRetries)}`,
    `Current item: ${cycle.currentThreadId || "-"} @ ${count(cycle.currentPosition) || "-"}`,
    `Next wake: ${cycle.nextRunAt || 0}`,
    `Blocked: ${cycle.blockedReason || "-"} until ${cycle.blockedUntil || 0}`,
    `Updated: ${cycle.updatedAt || 0}`,
    ...formatRecentUpdateErrors(errors),
  ]
    .join("\n")
    .slice(0, 32000);
}

export function patchAutoUpdateView(root, cycle, runtime = {}) {
  if (!root) return;
  const set = (role, value) => {
    const node = root.querySelector(`[data-role="${role}"]`);
    if (node) node.textContent = String(value);
  };
  const total = count(cycle?.total);
  const hybrid = describeHybridStatus(runtime.hybridStatus, runtime.preferLatestApi);
  set("hybridMode", hybrid.mode);
  set("apiUsage", hybrid.usage);
  set("apiAvailability", hybrid.availability);
  set("lastSource", hybrid.source);
  const completed = count(cycle?.completed);
  const staleDay = Boolean(cycle?.dailyKey && cycle.dailyKey !== localDayKey());
  const limit = count(cycle?.checksPerDay);
  const siteBlock = getSiteBlockLabel(cycle);
  set(
    "state",
    runtime.recoveryPending && !runtime.running
      ? "WAITING FOR PREVIOUS PROCESS"
      : siteBlock
        ? `PAUSED: ${siteBlock.toUpperCase()}`
        : String(cycle?.status || "idle").toUpperCase(),
  );
  set("cycleProgress", `${completed} / ${total}`);
  set(
    "dailyProgress",
    `${staleDay ? 0 : count(cycle?.dailyAttempted)} / ${limit || runtime.checksPerDay || 0}`,
  );
  set("completed", completed);
  set("retryPending", count(cycle?.retryPending));
  set("terminalFailed", count(cycle?.failed));
  set(
    "nextWake",
    time(runtime.recoveryPending && !runtime.running ? runtime.recoveryAt : cycle?.nextRunAt),
  );
  set("lastActivity", time(cycle?.updatedAt));
  set(
    "currentItem",
    cycle?.currentThreadId
      ? `${cycle.currentPosition || "-"}. ${cycle.currentThreadId}`
      : "-",
  );
  set("cycleId", cycle?.cycleId || "-");
  set(
    "cycleCounts",
    `current ${count(cycle?.current)} · changed ${count(cycle?.changed)} · skipped ${count(cycle?.skipped)} · network retries ${count(cycle?.networkRetries)}`,
  );
  const progress = root.querySelector('[data-role="progress"]');
  if (progress) {
    progress.max = Math.max(1, total);
    progress.value = completed;
  }
  const primary = root.querySelector('[data-role="primaryAction"]');
  if (primary) {
    const state = derivePrimaryUpdateAction(cycle, runtime);
    primary.textContent = state.label;
    primary.disabled = state.disabled;
    primary.dataset.autoAction = state.action;
    primary.setAttribute("aria-label", state.label);
  }
  const pause = root.querySelector('[data-auto-action="pause"]');
  if (pause)
    pause.hidden =
      !runtime.running ||
      !cycle ||
      ["completed", "paused"].includes(cycle.status);
}

function renderAutoUpdateMarkup(config, cycle) {
  const field = (label, name, value, min, max) => {
    if (name === "checksPerDay") { min = 1; max = 150; }
    if (name === "spacingMs") min = LIBRARY_MIN_UPDATE_SPACING_MS;
    return `<label><span>${label}</span><input name="${name}" type="number" min="${min}" max="${max}" value="${escapeHtml(value)}"></label>`;
  };
  const primary = derivePrimaryUpdateAction(cycle);
  return `<form class="f95ue-library-auto-dialog" data-role="auto-update-dialog"><section class="f95ue-library-auto-overview"><div class="f95ue-library-auto-heading"><strong>Update overview</strong><span class="f95ue-library-auto-state" data-role="state">IDLE</span></div><progress data-role="progress" max="1" value="0"></progress><div class="f95ue-library-auto-stats"><span>Cycle <strong data-role="cycleProgress">0 / 0</strong></span><span>Today <strong data-role="dailyProgress">0 / ${config.checksPerDay}</strong></span><span>Completed <strong data-role="completed">0</strong></span><span>Retry pending <strong data-role="retryPending">0</strong></span><span>Terminal <strong data-role="terminalFailed">0</strong></span></div><div class="f95ue-library-auto-meta"><span>Current: <b data-role="currentItem">-</b></span><span>Next: <b data-role="nextWake">-</b></span><span>Last activity: <b data-role="lastActivity">-</b></span></div></section><details><summary>Cycle details &gt;</summary><div class="f95ue-library-auto-details"><div>Cycle ID: <span data-role="cycleId">-</span></div><div data-role="cycleCounts">current 0 · changed 0 · skipped 0 · network retries 0</div><button type="button" data-auto-action="copy-diagnostics">Copy diagnostics</button><button type="button" data-auto-action="restart">Restart cycle...</button></div></details><details><summary>Update settings &gt;</summary><div class="f95ue-library-auto-grid"><label class="f95ue-library-auto-toggle"><input name="enabled" type="checkbox"${config.enabled !== false ? " checked" : ""}><span>Check eligible Library records automatically</span></label>${field("Checks per day", "checksPerDay", config.checksPerDay, 1, 500)}${field("Update hour (local, 0-23)", "runHour", config.runHour, 0, 23)}${field("Spacing (ms)", "spacingMs", config.spacingMs, 5000, 30000)}${field("Timeout (ms)", "timeoutMs", config.timeoutMs, 1000, 30000)}${field("Retries", "retryLimit", config.retryLimit, 0, 5)}<button type="submit" class="primary">Save settings</button></div></details><div class="f95ue-library-auto-actions"><button type="button" class="primary" data-role="primaryAction" data-auto-action="${primary.action}"${primary.disabled ? " disabled" : ""}>${primary.label}</button><button type="button" data-auto-action="pause">Pause</button><button type="button" data-auto-action="cancel">Close</button></div></form>`;
}

export function renderAutoUpdateDialog(config, cycle) {
  return renderAutoUpdateMarkup(config, cycle)
    .replace(
      '<label><span>Checks per day</span>',
      `<label class="f95ue-library-auto-toggle"><input name="preferLatestApi" type="checkbox"${config.preferLatestApi === true ? " checked" : ""}><span>Prefer Latest API while its allowance is available; otherwise use thread HTML. Search coverage is not guaranteed.</span></label><label><span>Checks per day</span>`,
    )
    .replace('<details><summary>Cycle details', '<section aria-label="Request sources"><div data-role="hybridMode"></div><div data-role="apiUsage"></div><div data-role="apiAvailability"></div><div data-role="lastSource"></div><div>Updater accounting only; excludes ordinary browsing and other scripts. Not F95\'s remaining server quota.</div></section><details><summary>Cycle details')
    .replace(
      '<form class="f95ue-library-auto-dialog" data-role="auto-update-dialog">',
      '<form class="f95ue-library-auto-dialog" data-role="auto-update-dialog"><div class="f95ue-library-auto-body" data-role="auto-update-scroll" data-preserve-scroll="auto-update">',
    )
    .replace(
      '<div class="f95ue-library-auto-actions">',
      '</div><div class="f95ue-library-auto-actions">',
    )
    .replaceAll(" &gt;</summary>", "</summary>");
}
