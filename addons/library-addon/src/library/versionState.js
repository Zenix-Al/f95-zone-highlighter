import { normalizeVersionIdentity } from "./updateEventModel.js";

export function hasUnacknowledgedUpdate(record) {
  return String(record?.updateState || "").trim().toLowerCase() === "changed";
}

export function hasUnplayedCurrentVersion(record) {
  const currentVersion = normalizeVersionIdentity(record?.thread?.currentVersion);
  const lastPlayedVersion = normalizeVersionIdentity(
    record?.personal?.lastPlayedVersion,
  );
  return Boolean(
    currentVersion && lastPlayedVersion && currentVersion !== lastPlayedVersion,
  );
}
