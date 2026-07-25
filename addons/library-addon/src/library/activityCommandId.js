let sequence = 0;

export function createActivityCommandId(kind = "activity") {
  sequence += 1;
  return `${String(kind || "activity")}:${Date.now()}:${sequence}`;
}
