import { getAddonAccess, getCoreThrottle } from "../../api/meta.js";
import { disableFeature, enableFeature, refreshFeature } from "../../api/feature.js";
import { getPageContext } from "../../api/page.js";
import { showCoreToast } from "../../api/toast.js";

export function createMetadataActions({ core, state }) {
  return {
    "meta-access": async () => {
      const result = await getAddonAccess(core);
      state.meta.access = result?.ok
        ? result.value
        : { error: result?.reason || "unknown" };
      return result;
    },
    "meta-throttle": async () => {
      const result = await getCoreThrottle(core);
      state.meta.throttle = result?.ok
        ? result.value
        : { error: result?.reason || "unknown" };
      return result;
    },
    "meta-page": async () => {
      const result = await getPageContext(core);
      return result
        ? { ok: true, value: result }
        : { ok: false, reason: "unsupported_action" };
    },
    "toast-show": () => showCoreToast(core, "Hello from Example Add-on", "info"),
    "feature-enable": () => enableFeature(core),
    "feature-refresh": () => refreshFeature(core),
    "feature-disable": () => disableFeature(core),
  };
}
