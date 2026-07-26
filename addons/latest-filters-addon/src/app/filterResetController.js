import {
  RESET_RECONCILE_ATTEMPTS,
  RESET_RECONCILE_DELAY_MS,
} from "../constants.js";
import { resetPrefixGroup, resetTagFilter } from "../domain/filterRoute.js";
import { isLatestPage } from "../domain/presets.js";
import { createFilterResetControls } from "../ui/filterResetControls.js";

const RESOURCE_ID = "latest-filter-reset-reconcile";

export function createLatestFilterResetController({
  getLifecycle,
  isEnabled,
  isTerminal,
  isCurrent,
  onRouteApplied,
} = {}) {
  let timer = 0;
  let attempt = 0;

  function applyMutation(result) {
    if (!result?.changed) return false;
    const nextUrl = new URL(result.url, location.origin);
    if (
      nextUrl.origin === location.origin &&
      nextUrl.pathname === location.pathname &&
      nextUrl.search === location.search
    ) {
      location.hash = nextUrl.hash;
      onRouteApplied?.();
      return true;
    }
    location.assign(nextUrl.href);
    return true;
  }

  const controls = createFilterResetControls({
    onReset: ({ kind, prefixIds }) => {
      if (!isEnabled?.() || isTerminal?.() || !isLatestPage()) return;
      const result =
        kind === "prefix-group"
          ? resetPrefixGroup(location.href, prefixIds, location.origin)
          : resetTagFilter(location.href, kind, location.origin);
      applyMutation(result);
    },
  });

  function cancelTimer() {
    if (timer) window.clearTimeout(timer);
    timer = 0;
    attempt = 0;
    getLifecycle?.()?.releaseResource?.(RESOURCE_ID);
  }

  function stop() {
    cancelTimer();
    controls.destroy();
  }

  function schedule(context) {
    cancelTimer();
    if (!isCurrent?.(context) || !isEnabled?.() || !isLatestPage()) {
      controls.destroy();
      return;
    }
    controls.reconcile();
    const reconcile = () => {
      timer = 0;
      if (!isCurrent?.(context) || !isEnabled?.() || !isLatestPage()) {
        stop();
        return;
      }
      controls.reconcile();
      attempt += 1;
      if (attempt >= RESET_RECONCILE_ATTEMPTS) {
        getLifecycle?.()?.releaseResource?.(RESOURCE_ID);
        return;
      }
      timer = window.setTimeout(reconcile, RESET_RECONCILE_DELAY_MS);
    };
    timer = window.setTimeout(reconcile, RESET_RECONCILE_DELAY_MS);
    getLifecycle?.()?.registerResource(
      RESOURCE_ID,
      () => {
        if (timer) window.clearTimeout(timer);
        timer = 0;
        attempt = 0;
      },
      "timer",
    );
  }

  return { applyMutation, schedule, stop };
}
