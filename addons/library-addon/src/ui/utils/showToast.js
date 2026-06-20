import { bridge } from "../../main.js";

export function showToast(message, type = "info") {
  bridge.invokeCoreAction("toast.show", {
    message: String(message || ""),
    type,
  });
}
