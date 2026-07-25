export function createUpdateRepository(api) {
  return {
    get(id) {
      return api.getUpdateEvent(id);
    },
    put(event) {
      return api.putUpdateEvent(event);
    },
    remove(id) {
      return api.deleteUpdateEvent(id);
    },
    async listByThread(threadId, limit = 50) {
      const result = await api.queryUpdateEvents(threadId, limit);
      if (!result?.ok) throw new Error(String(result?.reason || "update_query_failed"));
      return Array.isArray(result.value) ? result.value : [];
    },
    async listAll(limit = 10000) {
      const result = await api.queryAllUpdateEvents(limit);
      if (!result?.ok) throw new Error(String(result?.reason || "update_query_failed"));
      return Array.isArray(result.value) ? result.value : [];
    },
  };
}
