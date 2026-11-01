// Pure matching only: continuation ownership is still checked by the controller.
export function findHostRoute(definition, input = location.href, role) {
  try {
    const url = new URL(input, `https://${definition.canonicalHost}/`);
    for (const rule of definition.routes) {
      if (!(rule.hosts || definition.hostIncludes).includes(url.hostname)) continue;
      const match = rule.path.exec(url.pathname);
      if (!match || (role && !rule[role])) continue;
      if (
        Object.entries(rule.query || {}).some(
          ([key, pattern]) => !pattern.test(url.searchParams.get(key) || ""),
        )
      )
        continue;
      if (rule.emptyQuery?.some((key) => url.searchParams.get(key))) continue;
      const stage = role ? rule[role] : rule.entry;
      let identity;
      if (stage) {
        const source = stage.identity;
        identity =
          typeof source === "function"
            ? source(url, match)
            : typeof source === "number"
              ? match[source]
              : source?.query
                ? url.searchParams.get(source.query)
                : source;
        if (identity == null || (role !== "continuation" && !identity)) continue;
      }
      return {
        kind: rule.terminalKeys?.some((key) => url.searchParams.has(key))
          ? rule.terminalKind
          : rule.kind || "file",
        url,
        match,
        rule,
        stage: stage && {
          identity,
          nextStage: stage.nextStage,
          ...(stage.consumeExisting !== undefined
            ? { consumeExisting: stage.consumeExisting }
            : {}),
        },
      };
    }
  } catch {
    /* Invalid URLs/identities never authorize a route. */
  }
  return null;
}
