// A maximum, not an extra allowance: existing consumed checks are never reset.
export function getDailyCheckLimit(entryCount) {
  if (entryCount == null || !Number.isSafeInteger(Number(entryCount)) || Number(entryCount) < 0)
    return 150;
  const count = Number(entryCount);
  return Math.max(1, Math.min(count, Math.max(150, Math.ceil(count / 3))));
}
