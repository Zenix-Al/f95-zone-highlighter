const F95_HOSTS = new Set(["f95zone.to", "www.f95zone.to"]);

export function classifyMaskedDirectContext(
  locationLike,
  { isSupportedExternalHost = () => false } = {},
) {
  const hostname = String(locationLike?.hostname || "").toLowerCase();
  const pathname = String(locationLike?.pathname || "");

  if (F95_HOSTS.has(hostname)) {
    const route = pathname.startsWith("/threads/")
      ? "thread"
      : pathname.startsWith("/masked/")
        ? "masked"
        : "unsupported";
    return {
      kind: route === "unsupported" ? "unsupported" : "f95-core",
      route,
      usesCore: route !== "unsupported",
    };
  }

  if (
    (hostname === "www.google.com" || hostname === "www.recaptcha.net") &&
    pathname.startsWith("/recaptcha/")
  ) {
    return {
      kind: "external-standalone",
      route: "recaptcha-frame",
      usesCore: false,
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
