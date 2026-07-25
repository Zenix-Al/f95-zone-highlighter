export function createNavigationHandlers(context) {
  const { reloadRows, state } = context;

  return {
    prev: async () => {
      if (state.page > 1) {
        state.page -= 1;
        state.pageCursors = state.pageCursors.slice(0, state.page);
        await reloadRows();
      }
    },
    next: async () => {
      if (state.hasNextPage) {
        state.pageCursors[state.page] =
          state.paginationMode === "keyset" ? state.nextCursor : null;
        state.page += 1;
        await reloadRows();
      }
    },
  };
}
