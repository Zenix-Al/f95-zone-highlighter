export function getPageContext(core) {
  return core.invokeCoreAction("page.getContext", {}).then((result) =>
    result?.ok ? result.value : null,
  );
}
