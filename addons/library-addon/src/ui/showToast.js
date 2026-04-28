import { bridge } from "../main";
export function showToast(message, type = "info") {
  bridge.invokeCoreAction("toast.show", {
    message: String(message || ""),
    type,
  });
}
