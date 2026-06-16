export function createNavigationHandlers(context) {
  const { getMaxPage, reloadRows, state } = context;

  return {
    prev: async () => {
      if (state.page > 1) {
        state.page -= 1;
        await reloadRows();
      }
    },
    next: async () => {
      if (state.page < getMaxPage()) {
        state.page += 1;
        await reloadRows();
      }
    },
  };
}
