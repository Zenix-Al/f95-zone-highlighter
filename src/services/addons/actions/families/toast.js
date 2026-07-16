import { defineAction } from "../contract.js";

export function actionToastShow(showToast, payload) {
  const message = String(payload?.message || "").trim();
  if (!message) return { ok: false, reason: "message_required" };
  const type = String(payload?.type || "info").trim();
  showToast(message, undefined, type);
  return { ok: true };
}

export const toastActions = Object.freeze([
  defineAction({
    id: "toast.show", requiredCapabilities: ["toast"],
    execute: ({ payload, deps }) => actionToastShow(deps.showToast, payload),
  }),
]);
