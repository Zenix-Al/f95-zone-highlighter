export function getClaimJitter(jitterMs, random = Math.random) {
  const max = Math.max(0, Number(jitterMs || 0));
  return Math.min(max, Math.max(0, Math.floor(random() * (max + 1))));
}

export function getFailureDelay(intervalMs, consecutiveFailures) {
  const interval = Math.max(60_000, Number(intervalMs || 0));
  const failures = Math.max(1, Number(consecutiveFailures || 1));
  return interval * 2 ** Math.min(5, failures);
}

export function selectDueRecords(
  records,
  { now, limit, failedOnly = false, ignoreSchedule = false },
) {
  return (Array.isArray(records) ? records : [])
    .filter((record) => record.updateCheck?.enabled !== false)
    .filter((record) => !failedOnly || record.updateCheck?.status === "failed")
    .filter(
      (record) =>
        ignoreSchedule || Number(record.updateCheck?.nextCheckAt || 0) <= now,
    )
    .sort(
      (left, right) =>
        Number(left.updateCheck?.nextCheckAt || 0) -
        Number(right.updateCheck?.nextCheckAt || 0),
    )
    .slice(0, Math.max(0, Number(limit || 0)));
}
