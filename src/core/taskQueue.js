import { debugLog } from "./logger";

/**
 * Creates a new Task Queue to process items sequentially with a delay.
 * @param {object} options
 * @param {number} options.delay - The delay in ms between processing each task.
 * @param {string} options.name - A name for debugging purposes.
 * @returns {{add: function, stop: function, start: function, clear: function, size: function}}
 */
export function createTaskQueue({ delay = 100, name = "UnnamedQueue" }) {
  const queue = new Map(); // Map<key, { task: Function, generation: number }>
  let isProcessing = false;
  let timer = null;
  let currentGeneration = 0;

  async function process() {
    if (queue.size === 0) {
      isProcessing = false;
      debugLog(name, "Queue empty, processing stopped.");
      return;
    }

    isProcessing = true;

    // Get the next task from the queue
    const [key, { task }] = queue.entries().next().value;
    queue.delete(key);

    try {
      await task(); // Execute the task (can be async)
    } catch (e) {
      console.error(`[${name}] Task failed:`, e);
    }

    // Schedule the next one
    timer = setTimeout(process, delay);
  }

  function add(key, task, generation) {
    // If a generation is provided and it doesn't match the queue's current one,
    // this task is from a stale page load. Reject it immediately.
    if (generation !== undefined && generation !== currentGeneration) {
      return;
    }

    if (queue.has(key)) {
      return; // Don't add duplicate tasks
    }

    // Store the task along with its generation ID.
    queue.set(key, { task, generation });

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
    debugLog(name, "Queue cleared completely.");
  }

  /**
   * Sets a new generation for the queue, purging all tasks from previous generations.
   * This is the primary mechanism for invalidating stale work during SPA navigation.
   * @param {number} newGeneration The new generation ID.
   */
  function setGeneration(newGeneration) {
    debugLog(name, `Setting new generation to ${newGeneration}. Purging stale tasks.`);
    currentGeneration = newGeneration;
    let purgedCount = 0;
    for (const [key, { generation }] of queue.entries()) {
      if (generation !== undefined && generation !== currentGeneration) {
        queue.delete(key);
        purgedCount++;
      }
    }
    if (purgedCount > 0) debugLog(name, `Purged ${purgedCount} stale tasks from the queue.`);
  }

  return { add, start, clear, setGeneration, size: () => queue.size };
}
