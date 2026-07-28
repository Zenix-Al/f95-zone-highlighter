const CLIPBOARD_LIMIT = 4096;

export async function writeClipboard(
  value,
  {
    navigatorObject = globalThis.navigator,
    documentObject = globalThis.document,
  } = {},
) {
  const text = String(value || "").slice(0, CLIPBOARD_LIMIT);
  if (!text) return { ok: false, reason: "empty_clipboard_value" };
  try {
    if (typeof navigatorObject?.clipboard?.writeText === "function") {
      await navigatorObject.clipboard.writeText(text);
      return { ok: true };
    }
  } catch {
    // Continue to the bounded transient fallback.
  }
  const textarea = documentObject?.createElement?.("textarea");
  if (!textarea || !documentObject?.body) {
    return { ok: false, reason: "clipboard_unavailable" };
  }
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.hidden = true;
  documentObject.body.appendChild(textarea);
  try {
    textarea.select();
    return documentObject.execCommand?.("copy")
      ? { ok: true }
      : { ok: false, reason: "clipboard_unavailable" };
  } catch {
    return { ok: false, reason: "clipboard_unavailable" };
  } finally {
    textarea.remove();
  }
}
