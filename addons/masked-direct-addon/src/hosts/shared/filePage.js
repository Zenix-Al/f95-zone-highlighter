import { isExactDirectDownloadHost } from "../metadata.js";

export function matchesDirectDownloadHostPath(
  url,
  { hostId, pathPattern, baseUrl = location.href },
) {
  try {
    const parsed = new URL(url, baseUrl);
    return (
      isExactDirectDownloadHost(hostId, parsed.hostname) &&
      pathPattern instanceof RegExp &&
      pathPattern.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

export function classifyFilePageUrl(
  url,
  {
    pathPattern,
    terminalQueryKeys = [],
    baseUrl = location.href,
  },
) {
  try {
    const parsed = new URL(url, baseUrl);
    if (!(pathPattern instanceof RegExp) || !pathPattern.test(parsed.pathname)) {
      return "unsupported";
    }
    if (terminalQueryKeys.some((key) => parsed.searchParams.has(key))) {
      return "terminal";
    }
    return "file";
  } catch {
    return "unsupported";
  }
}
