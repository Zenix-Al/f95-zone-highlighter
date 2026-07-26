import {
  clearThreadTitleChips,
  renderThreadTitleChips,
} from "./titleChips.js";

export function createThreadTitleController() {
  let generation = 0;

  async function render(record, context = null) {
    const token = ++generation;
    const isCurrent = () =>
      token === generation &&
      (!context ||
        typeof context.isCurrent !== "function" ||
        context.isCurrent());
    if (!isCurrent()) return { ok: false, reason: "cancelled" };
    return {
      ok: true,
      rendered: renderThreadTitleChips(record),
    };
  }

  async function clear() {
    generation += 1;
    clearThreadTitleChips();
    return { ok: true };
  }

  return { render, clear };
}
