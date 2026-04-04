export function createQueue(delay) {
  const queue = new Map();
  let isProcessing = false;

  async function process() {
    if (queue.size === 0) {
      isProcessing = false;
      return;
    }

    isProcessing = true;
    const [key, task] = queue.entries().next().value;
    queue.delete(key);

    try {
      await task();
    } catch {}

    setTimeout(process, delay);
  }

  return {
    add(key, task) {
      if (queue.has(key)) return;
      queue.set(key, task);
      if (!isProcessing) {
        isProcessing = true;
        setTimeout(process, 0);
      }
    },
    clear() {
      queue.clear();
    },
  };
}
