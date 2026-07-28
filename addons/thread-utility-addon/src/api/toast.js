export function showCoreToast(core, message, type = "info") {
  return core.invokeCoreAction("toast.show", {
    message: String(message || ""),
    type,
  });
}
