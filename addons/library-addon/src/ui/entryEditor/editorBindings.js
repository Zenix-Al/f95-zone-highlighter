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
    (event) => {
      if (!event.target?.closest?.('[data-editor-action="played-version"]')) return;
      void onPlayedVersion?.();
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
      if (!event.target?.closest?.('[data-editor-action="acknowledge-update"]')) return;
      void onAcknowledge?.();
    },
    options,
  );

  return () => controller.abort("entry-editor-closed");
}
