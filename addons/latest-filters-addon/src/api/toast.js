export function showToast(core, message) {
  return core.invokeCoreAction("toast.show", { message: String(message || "") });
}
