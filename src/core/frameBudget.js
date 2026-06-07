function now() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

export function nextFrame() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

export function createFrameBudget({ budgetMs = 4, minChunk = 25 } = {}) {
  const normalizedBudget = Math.max(1, Number(budgetMs) || 4);
  const normalizedMinChunk = Math.max(1, Number(minChunk) || 25);
  let frameStartedAt = now();
  let processed = 0;

  return {
    checkpoint() {
      processed += 1;
      if (processed < normalizedMinChunk || now() - frameStartedAt < normalizedBudget) return null;
      return nextFrame().then(() => {
        frameStartedAt = now();
        processed = 0;
        return true;
      });
    },
  };
}

export async function runFrameBudgeted(
  items,
  processItem,
  { budgetMs = 4, minChunk = 25, shouldContinue = null, startOnNextFrame = true } = {},
) {
  const list = Array.isArray(items) ? items : Array.from(items || []);
  const budget = createFrameBudget({ budgetMs, minChunk });
  if (startOnNextFrame && list.length > 0) await nextFrame();

  let processed = 0;
  for (let index = 0; index < list.length; index += 1) {
    if (typeof shouldContinue === "function" && !shouldContinue()) {
      return { completed: false, processed };
    }
    const itemResult = processItem(list[index], index);
    if (itemResult && typeof itemResult.then === "function") await itemResult;
    processed += 1;
    const checkpoint = budget.checkpoint();
    if (checkpoint) await checkpoint;
  }

  return { completed: true, processed };
}
