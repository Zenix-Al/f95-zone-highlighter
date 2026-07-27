export function readEditorDraft(form) {
  return {
    ...Object.fromEntries(
    [
      "status",
      "rating",
      "note",
      "progressNote",
      "lastPlayedVersion",
      "startedAt",
      "lastPlayedAt",
      "completedAt",
      "droppedAt",
    ].map((name) => [name, form.elements.namedItem(name)?.value ?? ""]),
    ),
    pinned: Boolean(form.elements.namedItem("pinned")?.checked),
    autoUpdateEnabled: Boolean(form.elements.namedItem("autoUpdateEnabled")?.checked),
  };
}

export function bindEntryEditor(root, { onSave, onCancel, onAcknowledge, onPlayedVersion }) {
  const controller = new AbortController();
  const options = { signal: controller.signal };

  root.addEventListener(
    "submit",
    (event) => {
      const form = event.target?.closest?.('[data-role="entry-editor"]');
      if (!form) return;
      event.preventDefault();
      void onSave(readEditorDraft(form));
    },
    options,
  );

  root.addEventListener(
    "click",
    async (event) => {
      const button = event.target?.closest?.('[data-editor-action="played-version"]');
      if (!button || button.disabled) return;
      button.disabled = true;
      const form = button.closest('[data-role="entry-editor"]');
      const result = await onPlayedVersion?.(form ? readEditorDraft(form) : null);
      if (!result?.ok && button.isConnected) button.disabled = false;
    },
    options,
  );

  root.addEventListener(
    "click",
    (event) => {
      if (!event.target?.closest?.('[data-editor-action="cancel"]')) return;
      void onCancel();
    },
    options,
  );

  root.addEventListener(
    "click",
    (event) => {
      const button = event.target?.closest?.(
        '[data-editor-action="acknowledge-update"]',
      );
      if (!button) return;
      const form = button.closest('[data-role="entry-editor"]');
      void onAcknowledge?.(form ? readEditorDraft(form) : null);
    },
    options,
  );

  return () => controller.abort("entry-editor-closed");
}
