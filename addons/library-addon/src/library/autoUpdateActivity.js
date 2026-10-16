// Presentation only: never interpret a thread's terminal failure as worker failure.
export function getAutoUpdateActivity(cycle, { running = false, reason = "", leaseActive = false } = {}) {
  if (reason && !["not_due", "paused", "cancelled", "lease_owned", "lease_lost", "site_blocked", "daily_allowance_exhausted", "already_running"].includes(reason)) return "error";
  if (reason === "paused") return "waiting";
  if (!cycle || cycle.status === "completed") return "idle";
  if (["paused", "waiting"].includes(cycle.status)) return "waiting";
  return running || leaseActive ? "working" : "waiting";
}

export const UPDATE_ACTIVITY_LABELS = Object.freeze({
  idle: "Auto update idle",
  working: "Auto update working",
  waiting: "Auto update paused or waiting",
  error: "Auto updater error",
});

export function patchUpdateActivity(button, activity = "idle") {
  if (!button) return;
  button.dataset.f95ueActivity = activity;
  button.title = UPDATE_ACTIVITY_LABELS[activity] || UPDATE_ACTIVITY_LABELS.idle;
}
