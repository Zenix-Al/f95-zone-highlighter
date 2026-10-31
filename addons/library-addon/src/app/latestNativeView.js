import { decorateLatestXhr, isLatestRecoveryFetch, latestNativeResponse, latestWireResponse } from "./latestNativeTransport.js";

export function createLibraryLatestView({ query, onModeChange = () => {}, reportError = () => {}, getWindow = () => window, responseTimeoutMs = 6000, redrawTimeoutMs = 1500 }) {
  const win = getWindow(), doc = win.document, location = win.location, history = win.history;
  const $ = win.jQuery || win.$;
  if (!$?.ajax || !$?.Deferred || !doc.querySelector("#controls_auto-refresh")) return null;
  const originalAjax = $.ajax, originalFetch = win.fetch;
  let enabled = false, disposed = false, frozen = false, normalHash = "", generation = 0, session = 0;
  let button = null, status = null, activeNetwork = null, pending = null, prepared = null, redrawTimer = null;
  let dirty = false;
  const changedMessage = "Library changed; results refresh on the next native redraw or after toggling this view.";
  const games = () => /\/sam\/latest_alpha\/?$/.test(location.pathname) &&
    (!location.hash.match(/\/cat=([^/]+)/) || location.hash.match(/\/cat=([^/]+)/)[1] === "games");
  function paint(message) {
    if (button) {
      button.hidden = !games(); button.classList.toggle("selected", enabled);
      button.setAttribute("aria-pressed", String(enabled));
      button.title = message || (enabled ? "Show normal Latest" : "Show only your Library");
      button.setAttribute("data-tooltip", button.title);
    }
    if (message && status && status.textContent !== message) status.textContent = message;
  }
  function cancel() {
    generation++; clearTimeout(redrawTimer); redrawTimer = null;
    pending?.cancel(); pending = null; prepared = null;
    activeNetwork?.abort?.(); activeNetwork = null;
  }
  function mode(value) { enabled = value; onModeChange(value); }
  function redraw() {
    clearTimeout(redrawTimer);
    const before = generation;
    win.dispatchEvent(new win.PopStateEvent("popstate"));
    if (!disposed && before === generation) redrawTimer = setTimeout(() => {
      redrawTimer = null;
      if (disposed || before !== generation) return;
      if (enabled) { mode(false); history.replaceState(null, "", `${location.pathname}${location.search}${normalHash}`); }
      const message = "Native Latest did not redraw; reload this page before trying again.";
      paint(message); reportError(message);
    }, redrawTimeoutMs);
  }
  function toggle() {
    // An initial request launched before installation cannot be generation-guarded.
    if (!enabled && $.active > 0 && !activeNetwork) { reportError("Latest is still loading; try Library only when it finishes."); return; }
    cancel(); mode(!enabled);
    if (enabled) {
      session++; normalHash = location.hash;
      history.replaceState(null, "", `${location.pathname}${location.search}${location.hash.replace(/\/page=\d+/, "") || "#/cat=games"}/page=1`);
    } else history.replaceState(null, "", `${location.pathname}${location.search}${normalHash}`);
    paint(enabled ? "Loading Library…" : "Normal Latest"); redraw();
  }
  function keydown(event) {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); }
  }
  function mount() {
    const refresh = doc.querySelector("#controls_auto-refresh");
    if (!refresh || button?.isConnected) return;
    button?.remove(); status?.remove();
    button = doc.createElement("a"); button.id = "f95ue-library-latest-only";
    button.dataset.addonId = "library-addon";
    button.dataset.f95ueLibraryToggle = "1"; button.setAttribute("role", "button"); button.tabIndex = 0;
    button.setAttribute("aria-label", "Library only"); button.setAttribute("data-tooltip", "Library only");
    const icon = doc.createElement("i"); icon.className = "fas fa-book"; icon.setAttribute("aria-hidden", "true"); button.append(icon);
    button.addEventListener("click", toggle); button.addEventListener("keydown", keydown);
    refresh.before(button);
    status = doc.createElement("span"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
    status.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;";
    button.after(status); paint();
  }
  function ajax(url, settings) {
    if (disposed) return originalAjax.apply(this, arguments);
    const options = typeof url === "string" ? { ...settings, url } : { ...url };
    let target;
    try { target = new URL(options.url, location.href); } catch { return originalAjax.apply(this, arguments); }
    if (target.origin !== location.origin || target.pathname !== "/sam/latest_alpha/latest_data.php" || target.searchParams.get("cmd") !== "list" || String(options.method || options.type || "GET").toUpperCase() !== "GET") return originalAjax.apply(this, arguments);
    cancel(); mount();
    dirty = false;
    if (!games() || target.searchParams.get("cat") !== "games") mode(false);
    const token = generation, current = () => !disposed && token === generation;
    const success = options.success, error = options.error;
    options.success = function (...args) { if (current()) success?.apply(this, args); };
    options.error = function (...args) { if (current()) error?.apply(this, args); };
    paint(enabled ? "Loading Library…" : "Normal Latest");
    if (!enabled) { activeNetwork = originalAjax.call(this, options); return activeNetwork; }
    const deferred = $.Deferred();
    const proxy = deferred.promise({ abort() { if (current()) cancel(); return proxy; } });
    const timeout = setTimeout(() => {
      if (!current()) return;
      pending = null;
      const response = { status: "error", msg: "Library loading timed out. Toggle Library only off to return to Latest." };
      options.success(response, "success", proxy); deferred.resolve(response, "success", proxy); paint(response.msg);
      // Keep a late local read from starting a request after the timeout.
      generation++;
    }, responseTimeoutMs);
    pending = { cancel() { clearTimeout(timeout); deferred.reject(proxy, "abort"); } };
    const task = Promise.resolve().then(() => query({ id: `${session}:${token}`, session, url: target.href, isCurrent: current }));
    prepared = { task, current };
    task.then((response) => {
      if (!current()) return;
      clearTimeout(timeout); pending = null;
      if (response.status !== "ok") {
        options.success(response, "success", proxy); deferred.resolve(response, "success", proxy); paint(response.msg); return;
      }
      const text = latestWireResponse(response), display = latestNativeResponse(response);
      const factory = options.xhr || $.ajaxSettings?.xhr || (() => new win.XMLHttpRequest());
      const filter = options.dataFilter;
      options.xhr = function () { return decorateLatestXhr(factory.call(this), text, current); };
      options.dataFilter = function (_raw, type) {
        const value = JSON.stringify(display);
        return filter ? filter.call(this, value, type) : value;
      };
      const apply = options.success, fail = options.error;
      options.success = function (...args) {
        if (!current()) return;
        const page = response.msg.pagination.page;
        if (String(page) !== target.searchParams.get("page")) history.replaceState(null, "", `${location.pathname}${location.search}${location.hash.replace(/\/page=\d+/, "")}/page=${page}`);
        paint(dirty ? changedMessage : `${response.msg.count} Library records`); mount(); apply?.apply(this, args); deferred.resolve(...args);
      };
      options.error = function (...args) { if (current()) { paint("Native Latest request failed; the site response was not bypassed."); fail?.apply(this, args); deferred.reject(...args); } };
      activeNetwork = originalAjax.call(this, options);
    }).catch((cause) => {
      clearTimeout(timeout);
      if (!current()) return;
      pending = null;
      const response = { status: "error", msg: `Library only: ${String(cause.message || "Unable to load records").slice(0, 200)}` };
      options.success(response, "success", proxy); deferred.resolve(response, "success", proxy); paint(response.msg);
    });
    return proxy;
  }
  async function fetchMirror(input, init) {
    if (!disposed && enabled && prepared && isLatestRecoveryFetch(input, init, location.origin, location.href)) {
      const request = prepared;
      const response = await request.task;
      if (!request.current() || !enabled) throw new win.DOMException("Mode changed", "AbortError");
      if (response.status !== "ok") throw new Error("Library recovery mirror is unavailable");
      return new win.Response(latestWireResponse(response), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return originalFetch.call(this, input, init);
  }
  function hide(event) {
    cancel();
    if (enabled) { mode(false); frozen = event.persisted; history.replaceState(null, "", `${location.pathname}${location.search}${normalHash}`); paint("Normal Latest"); }
  }
  function show(event) { if (event.persisted && frozen && !disposed) { frozen = false; redraw(); } }
  function stop({ redraw: shouldRedraw = true } = {}) {
    if (disposed) return;
    const restore = enabled && games();
    mode(false); disposed = true; cancel();
    if ($.ajax === ajax) $.ajax = originalAjax;
    if (win.fetch === fetchMirror) win.fetch = originalFetch;
    button?.removeEventListener("click", toggle); button?.removeEventListener("keydown", keydown);
    button?.remove(); status?.remove(); button = null; status = null;
    win.removeEventListener("pagehide", hide); win.removeEventListener("pageshow", show);
    if (restore) { history.replaceState(null, "", `${location.pathname}${location.search}${normalHash}`); if (shouldRedraw) redraw(); }
    query = null; onModeChange = () => {}; reportError = () => {};
  }
  $.ajax = ajax;
  if (typeof originalFetch === "function") win.fetch = fetchMirror;
  win.addEventListener("pagehide", hide); win.addEventListener("pageshow", show);
  mount();
  return { stop, refresh() { if (enabled && games()) redraw(); },
    invalidate() { if (enabled && !dirty) { dirty = true; paint(changedMessage); } },
    isEnabled: () => enabled };
}
