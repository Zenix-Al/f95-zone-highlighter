import { normalizePersonalRatingInput } from "../../../library/recordModel.js";
import { createActivityCommandId } from "../../../library/activityCommandId.js";
import { showToast } from "../../utils/showToast.js";

const RATING_SAVE_DEBOUNCE_MS = 500;

function clearTimer(state, id) {
  const timer = state.ratingSaveTimers.get(id);
  if (timer) window.clearTimeout(timer);
  state.ratingSaveTimers.delete(id);
}

export function cancelRatingWork(state) {
  state.ratingGeneration += 1;
  for (const timer of state.ratingSaveTimers.values()) window.clearTimeout(timer);
  state.ratingSaveTimers.clear();
  state.ratingCommitChains.clear();
}

export function createRatingHandlers(context) {
  const { api, notifyMutated, reloadRows, state } = context;

  async function commit(threadId) {
    const id = String(threadId || "").trim();
    if (!id) return { ok: false, reason: "thread_id_required" };
    clearTimer(state, id);
    const generation = state.ratingGeneration;
    const revision = state.ratingRevisionById.get(id) || 0;
    const value = normalizePersonalRatingInput(state.ratingDraftById.get(id));
    const previous = state.ratingCommitChains.get(id) || Promise.resolve();
    const current = previous.then(async () => {
      if (generation !== state.ratingGeneration) return { ok: false, reason: "cancelled" };
      const fresh = await api.getEntry(id);
      if (!fresh) return { ok: false, reason: "entry_not_found" };
      if (generation !== state.ratingGeneration) return { ok: false, reason: "cancelled" };
      const result = await api.applyPersonalActivity(
        id,
        { rating: value },
        {
          commandId: createActivityCommandId("rating"),
          shouldCancel: () => revision !== state.ratingRevisionById.get(id),
        },
      );
      if (generation !== state.ratingGeneration) return { ok: false, reason: "cancelled" };
      if (!result?.ok) {
        const committed = state.ratingCommittedById.get(id);
        state.ratingDraftById.set(id, committed ?? "");
        await showToast(`Failed to save rating: ${result?.reason || "unknown"}`, "error");
        await reloadRows();
        return result;
      }
      if ((state.ratingRevisionById.get(id) || 0) === revision) {
        state.ratingCommittedById.set(id, value);
        state.ratingDraftById.set(id, value ?? "");
      }
      notifyMutated();
      return result;
    });
    state.ratingCommitChains.set(id, current.catch(() => {}));
    return current;
  }

  return {
    "rating-input": async (threadId, rawValue) => {
      const id = String(threadId || "").trim();
      if (!id) return;
      const value = normalizePersonalRatingInput(rawValue);
      state.ratingDraftById.set(id, value ?? "");
      state.ratingRevisionById.set(id, (state.ratingRevisionById.get(id) || 0) + 1);
      clearTimer(state, id);
      state.ratingSaveTimers.set(
        id,
        window.setTimeout(() => void commit(id), RATING_SAVE_DEBOUNCE_MS),
      );
      return value;
    },
    "rating-commit": commit,
    "rating-cancel": async (threadId) => {
      const id = String(threadId || "").trim();
      clearTimer(state, id);
      state.ratingRevisionById.set(id, (state.ratingRevisionById.get(id) || 0) + 1);
      state.ratingDraftById.set(id, state.ratingCommittedById.get(id) ?? "");
      await reloadRows();
    },
  };
}
