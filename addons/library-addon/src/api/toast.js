export const showCoreToast = (core, message, type = "info") =>
  core.invokeCoreAction("toast.show", { message: String(message || ""), type });
