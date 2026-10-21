const F95_HOSTS = new Set(["f95zone.to", "www.f95zone.to"]);

export function classifyMaskedDirectContext(
  locationLike,
  { isSupportedExternalHost = () => false } = {},
) {
  const hostname = String(locationLike?.hostname || "").toLowerCase();
  const pathname = String(locationLike?.pathname || "");

  if (F95_HOSTS.has(hostname)) {
    if (/^\/dl\/\d+\/?$/.test(pathname)) {
      return { kind: "f95-continue", route: "download-intermediate", usesCore: false };
    }
    const route =
      /^\/(?:masked|dl)(?:\/|$)/.test(pathname)
        ? "unsupported"
        : pathname.startsWith("/threads/")
          ? "thread"
          : "site";
    return {
      kind: route === "unsupported" ? "unsupported" : "f95-core",
      route,
      usesCore: route !== "unsupported",
    };
  }

  if (isSupportedExternalHost(hostname)) {
    return {
      kind: "external-standalone",
      route: "download-host",
      usesCore: false,
    };
  }

  return { kind: "unsupported", route: "unsupported", usesCore: false };
}
