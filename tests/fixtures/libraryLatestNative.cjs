module.exports = function nativeFixture(window) {
  const normal = { status: "ok", msg: { data: [{ thread_id: 1, title: "Native", tags: [], prefixes: [], cover: "", screens: [], views: 100, likes: 2, rating: 3, ts: 100, date: "old", version: "1", creator: "Dev", watched: false, ignored: false, new: false }], count: 1, pagination: { page: 1, total: 1 } } };
  const requests = [], fetches = [];
  let status = 200;
  class Xhr extends window.EventTarget {
    constructor() { super(); this.readyState = 0; this.status = 0; this.responseType = ""; this._text = ""; }
    get responseText() { return this._text; }
    get response() { return this.responseType === "json" ? JSON.parse(this._text) : this._text; }
    open(_method, url) { this.url = new URL(url, window.location.href).href; this.responseURL = this.url; this.readyState = 1; }
    send() {
      requests.push(this.url);
      Promise.resolve().then(() => {
        if (this.aborted) return;
        this.status = status; this.readyState = 4; this._text = status === 200 ? JSON.stringify(normal) : "challenge";
        this.dispatchEvent(new window.Event("load"));
        this.dispatchEvent(new window.Event("loadend"));
      });
    }
    abort() { this.aborted = true; this.status = 0; this.readyState = 0; this._text = ""; this.dispatchEvent(new window.Event("abort")); this.dispatchEvent(new window.Event("loadend")); }
  }
  window.XMLHttpRequest = Xhr;
  const $ = { active: 0, ajaxSettings: { xhr: () => new Xhr() }, Deferred() {
    return { promise(object) { return object; }, resolve() {}, reject() {} };
  }, ajax(options) {
    const xhr = (options.xhr || $.ajaxSettings.xhr)();
    const handle = { abort: () => xhr.abort() };
    $.active++;
    let settled = false;
    const finish = () => { if (!settled) { settled = true; $.active--; } };
    xhr.addEventListener("load", () => {
      finish();
      if (xhr.status === 200) {
        const text = options.dataFilter ? options.dataFilter(xhr.responseText, "json") : xhr.responseText;
        options.success?.(JSON.parse(text), "success", xhr);
      } else options.error?.(xhr, "error");
    });
    xhr.addEventListener("abort", () => { finish(); options.error?.(xhr, "abort"); });
    xhr.open("GET", options.url); xhr.send();
    return handle;
  } };
  window.$ = $;
  window.fetch = async (...args) => { fetches.push(args); return new window.Response(JSON.stringify(normal)); };
  window.document.body.innerHTML = '<div class="controls-block"><a id="controls_auto-refresh"></a><a id="controls_notify"></a></div><div id="latest-page_items-wrap_inner"></div>';
  return { $, requests, fetches, normal, setStatus: (value) => { status = value; } };
};
