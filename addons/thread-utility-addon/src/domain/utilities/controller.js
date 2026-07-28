import { showCoreToast } from "../../api/toast.js";
import { writeClipboard } from "./clipboard.js";
import {
  buildQuickSearchUrl,
  registerQuickSearchUtilities,
} from "./quickSearch.js";

export const FIXED_UTILITY_DEFINITIONS = Object.freeze([
  Object.freeze({ id: "copy-thread-link", family: "fixed", label: "Copy thread link" }),
  Object.freeze({ id: "copy-title", family: "fixed", label: "Copy title" }),
  Object.freeze({ id: "copy-formatted", family: "fixed", label: "Copy title + URL" }),
  Object.freeze({ id: "opening-post", family: "fixed", label: "Go to opening post" }),
]);

export function createUtilityController({
  core,
  registry,
  quickSearches,
  getSettings,
  getActionContext,
  navigatorObject = globalThis.navigator,
  documentObject = globalThis.document,
  windowObject = globalThis.window,
}) {
  async function notify(result, successMessage) {
    if (result?.ok) {
      await showCoreToast(core, successMessage, "success");
    } else {
      await showCoreToast(core, "Thread utility action failed.", "error");
    }
    return result;
  }

  function navigate(url, newTab) {
    if (newTab) {
      windowObject?.open?.(url.href, "_blank", "noopener");
    } else {
      windowObject?.location?.assign?.(url.href);
    }
    return { ok: true, value: { url: url.href, newTab: Boolean(newTab) } };
  }

  function currentContext() {
    const context = getActionContext();
    return context?.snapshot && context.isCurrent?.() ? context : null;
  }

  registerQuickSearchUtilities(registry, quickSearches, (definition) => {
    const context = currentContext();
    if (!context) return { ok: false, reason: "stale_generation" };
    const settings = getSettings();
    const url = buildQuickSearchUrl({
      definition,
      snapshot: context.snapshot,
      scope: settings.searchScope,
      origin: context.snapshot.url || "https://f95zone.to",
    });
    return url
      ? navigate(url, settings.openSearchesInNewTab)
      : { ok: false, reason: "invalid_search" };
  });

  const fixed = new Map(FIXED_UTILITY_DEFINITIONS.map((entry) => [entry.id, entry]));
  for (const definition of fixed.values()) {
    registry.register({
      ...definition,
      execute: async () => {
        const context = currentContext();
        if (!context) return { ok: false, reason: "stale_generation" };
        const { snapshot } = context;
        if (definition.id === "copy-thread-link") {
          return notify(
            await writeClipboard(snapshot.url, { navigatorObject, documentObject }),
            "Thread link copied.",
          );
        }
        if (definition.id === "copy-title") {
          return notify(
            await writeClipboard(snapshot.title, { navigatorObject, documentObject }),
            "Thread title copied.",
          );
        }
        if (definition.id === "copy-formatted") {
          return notify(
            await writeClipboard(
              `${snapshot.title}\n${snapshot.url}`,
              { navigatorObject, documentObject },
            ),
            "Thread title and link copied.",
          );
        }
        const source = context.getSource?.(snapshot.sectionSources?.contentRootToken);
        const starter = source?.closest?.("article") || null;
        if (typeof starter?.scrollIntoView === "function") {
          starter.scrollIntoView({ behavior: "smooth", block: "start" });
          return { ok: true, value: { scrolled: true } };
        }
        const url = new URL(snapshot.url);
        if (snapshot.starter?.postId) url.hash = `post-${snapshot.starter.postId}`;
        return navigate(url, false);
      },
    });
  }

  return {
    execute: (id) => registry.execute(id, currentContext()),
    list: () => registry.list(),
  };
}
