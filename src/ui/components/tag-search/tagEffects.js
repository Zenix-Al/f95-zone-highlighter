import {
  debouncedProcessAllTilesReset,
  debouncedProcessThreadTags,
} from "../../../core/tasksRegistry";

export function triggerTagUpdateEffects() {
  debouncedProcessAllTilesReset();
  debouncedProcessThreadTags();
}
