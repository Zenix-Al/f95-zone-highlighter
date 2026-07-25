const ACTIVITY_TYPES = Object.freeze([
  "played-version",
  "status-change",
  "rating-change",
  "progress-note",
]);

function text(value) {
  return String(value ?? "").trim();
}

export function createActivityEvent({
  threadId,
  commandId,
  type,
  occurredAt,
  before = null,
  after = null,
  version = "",
}) {
  const normalizedType = text(type);
  const normalizedCommandId = text(commandId);
  if (!ACTIVITY_TYPES.includes(normalizedType)) {
    throw new Error("invalid_activity_type");
  }
  if (!normalizedCommandId) throw new Error("activity_command_id_required");
  return {
    id: `activity:${text(threadId)}:${normalizedCommandId}:${normalizedType}`,
    threadId: text(threadId),
    commandId: normalizedCommandId,
    type: normalizedType,
    occurredAt: Number(occurredAt),
    version: text(version),
    before,
    after,
  };
}

export function getActivityTypes() {
  return [...ACTIVITY_TYPES];
}
