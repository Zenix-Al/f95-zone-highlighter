export function getClaimJitter(jitterMs, random = Math.random) {
  const max = Math.max(0, Number(jitterMs || 0));
  return Math.min(max, Math.max(0, Math.floor(random() * (max + 1))));
}

export function getFailureDelay(intervalMs, consecutiveFailures) {
  const interval = Math.max(60_000, Number(intervalMs || 0));
  const failures = Math.max(1, Number(consecutiveFailures || 1));
  return interval * 2 ** Math.min(5, failures);
}

export function getLocalDayKey(timestamp = Date.now()) {
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getNextLocalDayAt(timestamp = Date.now()) {
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) return 0;
  date.setHours(24, 0, 0, 0);
  return date.getTime();
}

export function getNextScheduledAt(now, intervalMs, runHour = 0) {
  const current = new Date(Number(now));
  const interval = Math.max(60_000, Number(intervalMs || 0));
  const hour = Math.min(23, Math.max(0, Math.trunc(Number(runHour) || 0)));
  const anchor = new Date(current);
  anchor.setHours(hour, 0, 0, 0);
  if (anchor.getTime() > current.getTime()) return anchor.getTime();
  const slots = Math.floor((current.getTime() - anchor.getTime()) / interval) + 1;
  return anchor.getTime() + slots * interval;
}
