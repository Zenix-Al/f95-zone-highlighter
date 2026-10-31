import { createLatestCatalogLookup, loadLatestCollection, queryLatestCollection } from "../library/latestCollection.js";
import { createLibraryLatestView } from "./latestNativeView.js";

export function createLibraryLatestCollectionController({ core, library, getEnabled, getUrl = () => location.href, getWindow = () => window, createView = createLibraryLatestView }) {
  let view = null, generation = 0, session = null, cache = null, loading = null;
  let retryTimer = null, attempts = 0, invalidationQueued = false;
  const timers = new Map();
  const applicable = () => {
    try { return /\/sam\/latest_alpha\/?$/.test(new URL(getUrl()).pathname); } catch { return false; }
  };
  const active = () => Boolean(view) && getEnabled() && applicable();
  const cancelData = () => { generation++; session = null; cache = null; loading = null; };
  const yieldWork = () => new Promise((resolve) => {
    const timer = setTimeout(() => { timers.delete(timer); resolve(); }, 0);
    timers.set(timer, resolve);
  });
  async function start() {
    if (!getEnabled() || !applicable()) { await stop({ redraw: false }); return; }
    if (view) return;
    try {
      view = createView({ query, getWindow, onModeChange: (enabled) => { if (!enabled) cancelData(); },
        reportError: (message) => { void core.invokeCoreAction("toast.show", { message, type: "warning" }); } });
    } catch { view = null; }
    if (!view && attempts++ < 20 && !retryTimer) {
      retryTimer = setTimeout(() => { retryTimer = null; void start(); }, 500);
    }
  }
  async function stop(options = {}) {
    cancelData(); clearTimeout(retryTimer); retryTimer = null; attempts = 0;
    for (const [timer, resolve] of timers) { clearTimeout(timer); resolve(); }
    timers.clear();
    const current = view; view = null;
    current?.stop(options);
  }
  function changed() {
    generation++; cache = null; loading = null;
    if (!active() || !view.isEnabled() || invalidationQueued) return;
    invalidationQueued = true;
    Promise.resolve().then(() => {
      invalidationQueued = false;
      if (active() && view.isEnabled()) view.invalidate();
    });
  }
  function routeChanged(context) {
    try {
      if (context?.url && !/\/sam\/latest_alpha\/?$/.test(new URL(context.url).pathname)) void stop({ redraw: false });
    } catch { void stop({ redraw: false }); }
  }
  async function query(detail, retries = 0) {
    if (!active()) throw new Error("Library view is not active");
    if (session !== detail.session) { cancelData(); session = detail.session; }
    const token = generation;
    const current = () => token === generation && active() && detail.isCurrent?.() !== false;
    try {
      const url = new URL(detail.url);
      if (url.origin !== new URL(getUrl()).origin || url.pathname !== "/sam/latest_alpha/latest_data.php" || url.searchParams.get("cmd") !== "list" || url.searchParams.get("cat") !== "games") throw new Error("Unsupported Library query");
      if (!cache) {
        if (!loading) loading = (async () => {
          const result = await core.invokeCoreAction("config.getTagPrefs", { includePrefixes: true });
          if (!result?.ok) throw new Error("Library catalogs unavailable");
          if (!current()) throw new Error("cancelled");
          const loaded = await loadLatestCollection({
            lookup: createLatestCatalogLookup(result.value), yieldWork, isCurrent: current,
            readPage: (options) => library.queryEntriesPage({ ...options, sortBy: "updatedAt", sortDir: "desc" }),
          });
          if (!loaded.ok) throw new Error(loaded.reason);
          if (current()) cache = loaded.items;
          return loaded.items;
        })();
        await loading;
      }
      if (!current()) throw new Error("cancelled");
      const options = Object.fromEntries(url.searchParams);
      for (const name of ["tags", "notags", "prefixes", "noprefixes"]) {
        options[name] = [...url.searchParams.getAll(name), ...url.searchParams.getAll(`${name}[]`)].flatMap((value) => value.split(","));
      }
      const response = queryLatestCollection(cache, options);
      if (JSON.stringify(response).length > 60000) throw new Error("Library page is too large; choose fewer rows");
      return response;
    } catch (error) {
      if (!current()) {
        if (active() && session === detail.session && detail.isCurrent?.() !== false && retries < 2) return query(detail, retries + 1);
        throw error;
      }
      loading = null;
      return { status: "error", msg: `Library only: ${String(error.message || "Unable to read records").slice(0, 200)}` };
    }
  }
  return { start, stop, query, changed, routeChanged };
}
