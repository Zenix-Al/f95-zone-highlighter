import { nextFrame } from "../../core/frameBudget.js";

export function createCaptureQueue(processJob, { limit = 20, budgetMs = 4, shouldProcess = () => true, onDrop = () => {} } = {}) {
  const jobs = new Map();
  let draining = false;
  let dropped = 0;

  async function drain() {
    let frameStartedAt = Date.now();
    while (jobs.size > 0) {
      const key = jobs.keys().next().value;
      const job = jobs.get(key);
      jobs.delete(key);
      if (shouldProcess(job)) processJob(job);
      else { dropped += 1; onDrop(job, "stale_route"); }
      if (Date.now() - frameStartedAt >= budgetMs && jobs.size > 0) {
        await nextFrame();
        frameStartedAt = Date.now();
      }
    }
    draining = false;
  }

  return {
    enqueue(job) {
      const key = `${job.transport}|${job.url}`;
      if (jobs.has(key)) jobs.delete(key);
      jobs.set(key, job);
      while (jobs.size > limit) {
        const droppedKey = jobs.keys().next().value;
        const droppedJob = jobs.get(droppedKey);
        jobs.delete(droppedKey);
        dropped += 1;
        onDrop(droppedJob, "queue_limit");
      }
      if (draining) return;
      draining = true;
      const schedule = typeof requestAnimationFrame === "function" ? requestAnimationFrame : setTimeout;
      schedule(() => void drain());
    },
    clear() { jobs.clear(); draining = false; },
    getSnapshot() { return Object.freeze({ pendingItems: jobs.size, maxPendingItems: limit, draining, dropped }); },
  };
}
