import { invokeOptionalCoreAction } from "../../../shared/apiFallback.js";

export async function getPageContext(core, fallback) {
  const result = await invokeOptionalCoreAction(core, "page.getContext", {}, async () => ({
    ok: true,
    value: await fallback?.(),
  }));
  return result?.ok ? result.value : null;
}
