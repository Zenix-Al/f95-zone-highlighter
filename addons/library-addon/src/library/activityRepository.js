export function createActivityRepository(api) {
  return {
    get(id) {
      return api.getActivityEvent(id);
    },
    put(event) {
      return api.putActivityEvent(event);
    },
    remove(id) {
      return api.deleteActivityEvent(id);
    },
    async listByThread(threadId, limit = 50) {
      const result = await api.queryActivityEvents(threadId, limit);
      if (!result?.ok) throw new Error(String(result?.reason || "activity_query_failed"));
      return Array.isArray(result.value) ? result.value : [];
    },
    async listAll(limit = 10000) {
      const result = await api.queryAllActivityEvents(limit);
      if (!result?.ok) throw new Error(String(result?.reason || "activity_query_failed"));
      return Array.isArray(result.value) ? result.value : [];
    },
  };
}
