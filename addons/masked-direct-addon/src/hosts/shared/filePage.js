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
