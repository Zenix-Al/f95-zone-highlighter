export function bindUpdateInbox(root, handlers) {
  const controller = new AbortController();
  root.addEventListener(
    "click",
    (event) => {
      const button = event.target?.closest?.("button[data-inbox-action]");
      if (!button || button.disabled) return;
      const action = String(button.dataset.inboxAction || "");
      const threadId = String(button.dataset.threadId || "");
      if (handlers[action]) void handlers[action](threadId, button);
    },
    { signal: controller.signal },
  );
  return () => controller.abort("update-inbox-closed");
}
