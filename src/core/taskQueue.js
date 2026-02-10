import { debugLog } from "./logger";

/**
 * Creates a new Task Queue to process items sequentially with a delay.
 * @param {object} options
 * @param {number} options.delay - The delay in ms between processing each task.
 * @param {string} options.name - A name for debugging purposes.
 * @returns {{add: function, stop: function, start: function, clear: function, size: function}}
 */
export function createTaskQueue({ delay = 100, name = "UnnamedQueue" }) {
  const queue = new Map(); // Use a Map to prevent duplicate tasks by key
  let isProcessing = false;
  let timer = null;

  async function process() {
    if (queue.size === 0) {
      isProcessing = false;
      debugLog(name, "Queue empty, processing stopped.");
      return;
    }

    isProcessing = true;

    // Get the next task from the queue
    const [key, task] = queue.entries().next().value;
    queue.delete(key);

    try {
      await task(); // Execute the task (can be async)
    } catch (e) {
      console.error(`[${name}] Task failed:`, e);
    }

    // Schedule the next one
    timer = setTimeout(process, delay);
  }

  function add(key, task) {
    if (queue.has(key)) {
      return; // Don't add duplicate tasks
    }
    queue.set(key, task);
    debugLog(name, `Task added. Queue size: ${queue.size}`);

    if (!isProcessing) {
      start();
    }
  }

  function start() {
    if (isProcessing) return;
    debugLog(name, "Starting queue processing...");
    process();
  }

  function clear() {
    queue.clear();
    if (timer) clearTimeout(timer);
    isProcessing = false;
  }

  return { add, start, clear, size: () => queue.size };
}
