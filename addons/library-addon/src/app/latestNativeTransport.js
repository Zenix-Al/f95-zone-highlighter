export function latestListUrl(input, origin, base) {
  try {
    const url = new URL(typeof input === "string" ? input : input?.url, base);
    return url.origin === origin && url.pathname === "/sam/latest_alpha/latest_data.php" &&
      url.searchParams.get("cmd") === "list" && url.searchParams.get("cat") === "games" ? url : null;
  } catch { return null; }
}

// Match the existing capture recovery request conservatively. Updater requests
// use include/headers/signal and must never be redirected to the local collection.
export function isLatestRecoveryFetch(input, init, origin, base) {
  return typeof input === "string" && init?.credentials === "same-origin" &&
    Object.keys(init).every((key) => key === "credentials") && Boolean(latestListUrl(input, origin, base));
}

export function latestWireResponse(response) {
  if (response.status !== "ok") return JSON.stringify(response);
  return JSON.stringify({ ...response, msg: { ...response.msg, data: response.msg.data.map((row) => {
    const value = { ...row };
    // Omit unknown numeric facts instead of converting null into a false zero
    // rating in the existing core normalizer. Core's scoring rules stay unchanged.
    for (const key of ["views", "likes", "rating", "ts"]) if (value[key] == null) delete value[key];
    return value;
  }) } });
}

export function latestNativeResponse(response) {
  if (response.status !== "ok") return response;
  return { ...response, msg: { ...response.msg, data: response.msg.data.map((row) => ({
    ...row, views: row.views ?? "—", likes: row.likes ?? "—", rating: row.rating ?? 0, date: row.date || "Unknown",
  })) } };
}

export function decorateLatestXhr(xhr, text, isCurrent) {
  for (const name of ["responseText", "response"]) {
    let owner = xhr, descriptor;
    while (owner && !descriptor) { descriptor = Object.getOwnPropertyDescriptor(owner, name); owner = Object.getPrototypeOf(owner); }
    if (!descriptor?.get) throw new Error("Unsupported native XHR response accessors");
    const original = descriptor.get;
    Object.defineProperty(xhr, name, { configurable: true, get() {
      if (isCurrent() && xhr.readyState === 4 && xhr.status >= 200 && xhr.status < 300) {
        if (name === "response" && xhr.responseType === "json") return JSON.parse(text);
        if (!xhr.responseType || xhr.responseType === "text") return text;
      }
      return original.call(xhr);
    } });
  }
  return xhr;
}
