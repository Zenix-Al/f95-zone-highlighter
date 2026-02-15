const statuses = new Map();

function now() {
  return new Date().toISOString();
}

export function setFeatureStatus(id, status, details = null) {
  if (!id) return;
  statuses.set(id, {
    status,
    details: details ? String(details) : null,
    lastUpdated: now(),
  });
}

export function getFeatureStatus(id) {
  return statuses.get(id) || { status: "unknown", details: null, lastUpdated: null };
}

export function getAllFeatureStatuses() {
  const result = {};
  for (const [id, val] of statuses.entries()) {
    result[id] = val;
  }
  return result;
}

export function clearFeatureStatus(id) {
  if (id) statuses.delete(id);
}

export default {
  setFeatureStatus,
  getFeatureStatus,
  getAllFeatureStatuses,
  clearFeatureStatus,
};
