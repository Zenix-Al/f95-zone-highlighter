import { previewConfigImport } from "../../services/configTransferService.js";

/** Compatibility facade for older UI callers; transfer rules live in the service. */
export function validateImportedPayload(payload) {
  const result = previewConfigImport(payload);
  if (result.ok) return "";
  const first = result.issues?.[0];
  if (!first) return "Imported configuration is invalid.";
  return `${first.path || "config"} is invalid (${first.code || "validation"}).`;
}
